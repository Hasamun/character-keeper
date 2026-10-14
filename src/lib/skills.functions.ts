import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { normalizeCharacter } from './storage';
import { pushLog } from './rules';
import { performSkillAction } from './rules/skills';
import { canShareAction, normalizePermissions, projectShared } from './rules/sharing';
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
      if (perm.error || !perm.data || !canShareAction(p, 'skills')) throw new Error('Недостаточно прав');
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
    if (member) {
      const perm = await context.supabase.rpc('character_permission', { _id: data.id });
      return { duplicate: out.duplicate, version: out.version, character: saved, shared: projectShared(saved, normalizePermissions((perm.data as { permissions?: unknown } | null)?.permissions)) };
    }
    return { duplicate: out.duplicate, version: out.version, character: saved };
  });
    if (res.error) {
      if (res.error.message.includes('CONFLICT')) throw new Error('Персонаж изменился в другом окне. Данные обновлены — повторите действие');
      throw new Error(res.error.message.includes('Недостаточно') ? 'Недостаточно прав' : 'Не удалось выполнить действие');
    }
    const out = res.data as { duplicate: boolean; version: string; data: unknown };
    return { duplicate: out.duplicate, version: out.version, character: normalizeCharacter(out.data) };
  });
