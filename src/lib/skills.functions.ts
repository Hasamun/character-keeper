import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { normalizeCharacter } from './storage';
import { pushLog } from './rules';
import { performSkillAction, receiveSkill, transferPayload, transferSkill } from './rules/skills';
import { uid } from './rules';
import { canShareAction, normalizePermissions } from './rules/sharing';
import type { Json } from '@/integrations/supabase/types';

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('apply'), skillId: z.string().min(1).max(128) }),
  z.object({ type: z.literal('xp'), skillId: z.string().min(1).max(128), delta: z.number().int().min(-100000).max(100000), reason: z.string().min(1).max(500) }),
  z.object({ type: z.literal('exhaustion'), delta: z.number().int().min(-100000).max(100000), reason: z.string().max(500), kind: z.enum(['manual', 'rest', 'potion']) }),
  z.object({ type: z.literal('undo'), skillId: z.string().min(1).max(128) }),
]);

/** Computes the action with pure rules, then commits character + journal in one locked, version-checked, idempotent DB call. */
export const skillAction = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ id: z.string().min(1).max(128), opId: z.string().uuid(), version: z.string(), action }).parse(v))
  .handler(async ({ data, context }) => {
    const own = await context.supabase.from('characters').select('data,updated_at').eq('id', data.id).eq('owner_id', context.userId).maybeSingle();
    if (own.error) throw new Error('Персонаж недоступен');
    let member = false, source = own.data;
    if (!source) {
      // Shared hero: permission comes from the database; the row is read only after it is confirmed.
      const perm = await context.supabase.rpc('character_permission', { _id: data.id });
      const p = normalizePermissions((perm.data as { permissions?: unknown } | null)?.permissions);
      if (perm.error || !perm.data || !canShareAction(p, data.action.type === 'apply' || data.action.type === 'undo' ? 'skillsApply' : 'skills')) throw new Error('Недостаточно прав');
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const r = await supabaseAdmin.from('characters').select('data,updated_at').eq('id', data.id).maybeSingle();
      if (!r.data) throw new Error('Персонаж недоступен');
      member = true; source = r.data;
    }
    const c = normalizeCharacter(source.data);
    const r = performSkillAction(c, data.action, data.opId);
    if ('error' in r) throw new Error(r.error);
    const next = { ...r.character, log: [...r.character.log] };
    pushLog(next, r.logText);
    const payload = { _id: data.id, _op: data.opId, _expected: data.version, _data: JSON.parse(JSON.stringify(next)) as Json, _entries: JSON.parse(JSON.stringify(r.entries)) as Json };
    const res = member
      ? await (await import('@/integrations/supabase/client.server')).supabaseAdmin.rpc('commit_skill_action_member', { ...payload, _actor: context.userId })
      : await context.supabase.rpc('commit_skill_action', payload);
    if (res.error) {
      if (res.error.message.includes('CONFLICT')) throw new Error('Персонаж изменился в другом окне. Данные обновлены — повторите действие');
      throw new Error(res.error.message.includes('Недостаточно') ? 'Недостаточно прав' : 'Не удалось выполнить действие');
    }
    const out = res.data as { duplicate: boolean; version: string; data: unknown };
    const saved = normalizeCharacter(out.data);
    // Members never receive the full character; their screen re-reads the permission-filtered view.
    if (member) return { duplicate: out.duplicate, version: out.version, character: null };
    return { duplicate: out.duplicate, version: out.version, character: saved };
  });

/** Owner-only teaching between own heroes: only the recipient row changes, in one version-checked write. */
export const transferSkillFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ fromId: z.string().min(1).max(128), toId: z.string().min(1).max(128), skillId: z.string().min(1).max(128), mode: z.enum(['teach_novice', 'teach_current']), toVersion: z.string() }).parse(v))
  .handler(async ({ data, context }) => {
    const a = await context.supabase.rpc('account_active'); if (a.error || !a.data) throw new Error('Доступ закрыт');
    const db = context.supabase;
    const [f, t] = await Promise.all([db.from('characters').select('data').eq('id', data.fromId).eq('owner_id', context.userId).maybeSingle(), db.from('characters').select('data,updated_at').eq('id', data.toId).eq('owner_id', context.userId).maybeSingle()]);
    if (!f.data || !t.data) throw new Error('Оба героя должны быть вашими');
    if (t.data.updated_at !== data.toVersion) throw new Error('Персонаж изменился в другом окне. Обновите страницу и повторите');
    const r = transferSkill(normalizeCharacter(f.data.data), normalizeCharacter(t.data.data), data.skillId, data.mode, uid());
    if ('error' in r) throw new Error(r.error);
    const stamp = new Date().toISOString();
    const to = { ...r.to, log: [...r.to.log], updatedAt: stamp }; pushLog(to, `Изучен навык «${r.name}» у «${r.from.name}»`);
    const wt = await db.from('characters').update({ data: JSON.parse(JSON.stringify(to)) as Json, updated_at: stamp }).eq('id', data.toId).eq('owner_id', context.userId).eq('updated_at', t.data.updated_at).select('updated_at').maybeSingle();
    if (wt.error || !wt.data) throw new Error('Получатель изменился. Обновите страницу и повторите');
    return { name: r.name, toVersion: wt.data.updated_at };
  });

/** Offer to another player: the server snapshots the owner's skill (no exhaustion/effects/history); the recipient must accept. */
export const offerSkillFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ fromId: z.string().min(1).max(128), skillId: z.string().min(1).max(128), mode: z.enum(['teach_novice', 'teach_current']), email: z.string().trim().email().max(320) }).parse(v))
  .handler(async ({ data, context }) => {
    const f = await context.supabase.from('characters').select('data').eq('id', data.fromId).eq('owner_id', context.userId).maybeSingle();
    if (!f.data) throw new Error('Передавать может только владелец');
    const s = (normalizeCharacter(f.data.data).skills ?? []).find(x => x.id === data.skillId); if (!s) throw new Error('Навык не найден');
    const r = await context.supabase.rpc('create_skill_offer', { _char: data.fromId, _email: data.email, _mode: data.mode, _name: s.definition.name, _payload: JSON.parse(JSON.stringify(transferPayload(s, data.mode))) as Json });
    if (r.error) throw new Error(r.error.message.length < 120 ? r.error.message : 'Не удалось отправить предложение');
    return { id: r.data as string };
  });

export const listSkillOffers = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await context.supabase.from('skill_transfer_offers').select('id,from_user,to_user,from_character_name,from_user_name,skill_name,mode,payload,status,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(100);
    if (r.error) throw new Error('Не удалось загрузить предложения');
    return (r.data ?? []).map(o => ({ id: o.id, incoming: o.to_user === context.userId, fromName: o.from_user_name, heroName: o.from_character_name, skillName: o.skill_name, mode: o.mode as 'teach_novice' | 'teach_current', level: Number((o.payload as { level?: number } | null)?.level ?? 1), createdAt: o.created_at }));
  });

/** Recipient accepts onto one of their heroes: offer + hero are locked and committed in one DB call; repeats are idempotent. */
export const acceptSkillOffer = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ offerId: z.string().uuid(), toId: z.string().min(1).max(128) }).parse(v))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const [o, t] = await Promise.all([db.from('skill_transfer_offers').select('payload,from_character_name,from_user_name,to_user,status').eq('id', data.offerId).maybeSingle(), db.from('characters').select('data,updated_at').eq('id', data.toId).eq('owner_id', context.userId).maybeSingle()]);
    if (!o.data || o.data.to_user !== context.userId) throw new Error('Предложение не найдено');
    if (!t.data) throw new Error('Выберите своего героя');
    const from = `${o.data.from_character_name}${o.data.from_user_name ? ` (${o.data.from_user_name})` : ''}`;
    const r = receiveSkill(normalizeCharacter(t.data.data), o.data.payload, uid(), from);
    const to = { ...r.to, log: [...r.to.log] }; pushLog(to, `Изучен навык «${r.name}» у «${from}»`);
    const res = await db.rpc('accept_skill_offer', { _offer: data.offerId, _char: data.toId, _expected: t.data.updated_at, _data: JSON.parse(JSON.stringify(to)) as Json });
    if (res.error) throw new Error(res.error.message.includes('CONFLICT') ? 'Герой изменился. Повторите' : res.error.message.length < 120 ? res.error.message : 'Не удалось принять');
    return { name: r.name };
  });

export const decideSkillOffer = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ offerId: z.string().uuid(), action: z.enum(['decline', 'cancel']) }).parse(v))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc('decide_skill_offer', { _offer: data.offerId, _action: data.action });
    if (r.error) throw new Error(r.error.message.length < 120 ? r.error.message : 'Не удалось');
    return { ok: true };
  });
