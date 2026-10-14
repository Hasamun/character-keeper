import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { normalizeCharacter } from './storage';
import { pushLog, uid } from './rules';
import { publishableSkill, skillFromCatalog } from './rules/skills';
import type { Json, Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

async function access(db: SupabaseClient<Database>, userId: string, admin = false) {
  const a = await db.rpc('account_active'); if (a.error || !a.data) throw new Error('Аккаунт заблокирован или доступ недоступен');
  if (admin) { const r = await db.rpc('has_role', { _user_id: userId, _role: 'admin' }); if (r.error || !r.data) throw new Error('Недостаточно прав'); }
}
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Json;
const PAGE = 24;

export const listSkillCatalog = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ q: z.string().max(120).default(''), type: z.enum(['all', 'active', 'passive']).default('all'), sort: z.enum(['recent', 'name']).default('recent'), page: z.number().int().min(1).max(1000).default(1) }).parse(v))
  .handler(async ({ data, context }) => {
    await access(context.supabase, context.userId);
    let q = context.supabase.from('skill_catalog').select('id,name,type,data,version,updated_at,owner_id', { count: 'exact' }).eq('archived', false);
    if (data.q.trim()) q = q.ilike('name', `%${data.q.trim().replace(/[%_\\]/g, '')}%`);
    if (data.type !== 'all') q = q.eq('type', data.type);
    const r = await q.order(data.sort === 'name' ? 'name' : 'updated_at', { ascending: data.sort === 'name' }).order('id').range((data.page - 1) * PAGE, data.page * PAGE - 1);
    if (r.error) throw new Error('Не удалось загрузить каталог навыков');
    return { rows: (r.data ?? []).map(x => ({ ...x, mine: x.owner_id === context.userId })), count: r.count ?? 0, pageSize: PAGE };
  });

export const listSkillSubmissions = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ admin: z.boolean(), page: z.number().int().min(1).default(1) }).parse(v))
  .handler(async ({ data, context }) => {
    await access(context.supabase, context.userId, data.admin);
    let q = context.supabase.from('skill_catalog_submissions').select('*', { count: 'exact' });
    q = data.admin ? q.eq('status', 'pending') : q.eq('owner_id', context.userId);
    const r = await q.order('updated_at', { ascending: false }).range((data.page - 1) * PAGE, data.page * PAGE - 1);
    if (r.error) throw new Error('Не удалось загрузить предложения'); return { rows: r.data ?? [], count: r.count ?? 0 };
  });

export const submitSkill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ definition: z.unknown(), submissionId: z.string().uuid().optional(), catalogId: z.string().uuid().optional() }).parse(v))
  .handler(async ({ data, context }) => {
    await access(context.supabase, context.userId);
    const def = publishableSkill(data.definition); if (!def.name) throw new Error('У навыка нет названия');
    const r = await context.supabase.rpc('submit_skill', { _data: asJson(def), ...(data.submissionId ? { _submission_id: data.submissionId } : {}), ...(data.catalogId ? { _catalog_id: data.catalogId } : {}) });
    if (r.error) throw new Error(r.error.message.includes('недоступ') || r.error.message.includes('Недоступ') ? 'Предложение или навык недоступны' : 'Не удалось отправить навык на модерацию');
    return { id: r.data };
  });

export const reviewSkill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ id: z.string().uuid(), revision: z.number().int(), approve: z.boolean(), reason: z.string().max(1000) }).parse(v))
  .handler(async ({ data, context }) => {
    await access(context.supabase, context.userId, true);
    const r = await context.supabase.rpc('review_skill', { _id: data.id, _revision: data.revision, _approve: data.approve, _reason: data.reason });
    if (r.error) throw new Error(r.error.message.includes('уже') ? 'Предложение уже изменено или рассмотрено' : r.error.message.includes('причину') ? 'Укажите причину отклонения' : 'Не удалось сохранить решение');
    return { ok: true };
  });

export const archiveSkill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ id: z.string().uuid(), reason: z.string().max(1000) }).parse(v))
  .handler(async ({ data, context }) => {
    await access(context.supabase, context.userId, true);
    const r = await context.supabase.rpc('archive_skill', { _id: data.id, _reason: data.reason }); if (r.error) throw new Error('Не удалось убрать навык из каталога'); return { ok: true };
  });

/** Adds an independent copy (level 1, 0 XP) to the caller's own hero with a version-checked write. */
export const addCatalogSkill = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ catalogId: z.string().uuid(), characterId: z.string().min(1).max(128) }).parse(v))
  .handler(async ({ data, context }) => {
    await access(context.supabase, context.userId);
    const [c, s] = await Promise.all([
      context.supabase.from('characters').select('data,updated_at').eq('id', data.characterId).eq('owner_id', context.userId).maybeSingle(),
      context.supabase.from('skill_catalog').select('name,data').eq('id', data.catalogId).eq('archived', false).maybeSingle(),
    ]);
    if (!c.data) throw new Error('Персонаж недоступен'); if (!s.data) throw new Error('Навык недоступен');
    const character = normalizeCharacter(c.data.data);
    character.skills = [...(character.skills ?? []), skillFromCatalog(s.data.data, uid(), s.data.name)];
    pushLog(character, `Изучен навык из каталога «${s.data.name}»`);
    character.updatedAt = new Date().toISOString();
    const saved = await context.supabase.from('characters').update({ data: asJson(character), updated_at: character.updatedAt }).eq('id', data.characterId).eq('owner_id', context.userId).eq('updated_at', c.data.updated_at).select('updated_at').maybeSingle();
    if (saved.error || !saved.data) throw new Error('Персонаж изменился. Обновите страницу и повторите');
    return { version: saved.data.updated_at, character };
  });
