import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { normalizePermissions, projectShared, canShareAction, type Permissions } from './rules/sharing';
import { normalizeCharacter } from './storage';
import { addPrimaryExp, addSecondaryExp, uid, type Character } from './rules';
import { activateEquipmentEffect, endEffect, reconcileEffects, useItem } from './rules/derived';
import { addItem, autoEquip, removeItem, unequip, upsertItem, swapWeapons, setMoney, type Item, type Money } from './rules/inventory';
import type { Json } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const json = (v: unknown): Json => JSON.parse(JSON.stringify(v));
const idSchema = z.object({ id: z.string().min(1).max(128) });
async function permission(db: SupabaseClient<Database>, id: string) {
  const r = await db.rpc('character_permission', { _id: id });
  if (r.error || !r.data) throw new Error('Персонаж недоступен');
  return r.data as { owner: boolean; ownerId: string; ownerName: string; permissions: Permissions };
}
export const sharedCharacters = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const active = await context.supabase.rpc('account_active');
  if (!active.data || active.error) throw new Error('Доступ закрыт');
  const members = await context.supabase.from('character_members').select('character_id').eq('user_id', context.userId);
  if (members.error) throw new Error('Не удалось загрузить общих героев');
  const rows = await Promise.all((members.data ?? []).map(async m => {
    try {
      const access = await permission(context.supabase, m.character_id);
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const r = await supabaseAdmin.from('characters').select('data').eq('id', m.character_id).single();
      if (!r.data) return null;
      const c = normalizeCharacter(r.data.data);
      return { id: c.id, name: access.permissions.bio !== 'none' ? c.name : 'Общий персонаж', ownerName: access.ownerName, permissions: normalizePermissions(access.permissions) };
    } catch { return null; }
  }));
  return rows.filter((r): r is NonNullable<typeof r> => r !== null);
});
export const getSharedCharacter = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(v => idSchema.parse(v)).handler(async ({ data, context }) => {
  const a = await permission(context.supabase, data.id);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('characters').select('data,updated_at').eq('id', data.id).single();
  if (r.error || !r.data) throw new Error('Персонаж недоступен');
  const c = normalizeCharacter(r.data.data);
  return { ...a, permissions: normalizePermissions(a.permissions), character: projectShared(c, a.permissions), version: r.data.updated_at };
});
export const accessOverview = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(v => idSchema.parse(v)).handler(async ({ data, context }) => {
  const a = await permission(context.supabase, data.id);
  if (!a.owner) throw new Error('Только владелец управляет доступом');
  const [members, invites] = await Promise.all([
    context.supabase.from('character_members').select('user_id,permissions').eq('character_id', data.id),
    context.supabase.from('character_invites').select('id,recipient_id,permissions,status,expires_at').eq('character_id', data.id).order('created_at', { ascending: false }),
  ]);
  if (members.error || invites.error) throw new Error('Не удалось загрузить доступ');
  const ids = [...new Set([...(members.data ?? []).map(m => m.user_id), ...(invites.data ?? []).flatMap(i => i.recipient_id ? [i.recipient_id] : [])])];
  const profiles = ids.length ? await context.supabase.from('profiles').select('id,display_name').in('id', ids) : { data: [] };
  const names = Object.fromEntries((profiles.data ?? []).map(p => [p.id, p.display_name]));
  return { members: (members.data ?? []).map(m => ({ ...m, name: names[m.user_id] || 'Участник' })), invites: (invites.data ?? []).map(i => ({ ...i, name: i.recipient_id ? names[i.recipient_id] || 'Участник' : 'По ссылке' })) };
});
export const manageAccess = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(v => z.object({ id: z.string().min(1), action: z.enum(['account', 'link', 'permissions', 'remove', 'revoke']), permissions: z.unknown().optional(), email: z.string().max(254).optional(), target: z.string().uuid().optional() }).parse(v)).handler(async ({ data, context }) => {
  const p = normalizePermissions(data.permissions);
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const r = await context.supabase.rpc('manage_character_access', { _id: data.id, _action: data.action, _permissions: json(p), _email: data.email ?? '', _token: data.action === 'link' ? token : '', ...(data.target ? { _target: data.target } : {}) });
  if (r.error) throw new Error(r.error.message);
  return { id: r.data, token: data.action === 'link' ? token : null };
});
export const incomingInvites = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const active = await context.supabase.rpc('account_active'); if (!active.data) throw new Error('Доступ закрыт');
  const r = await context.supabase.from('character_invites').select('id,owner_id,permissions,expires_at').eq('recipient_id', context.userId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
  if (r.error) throw new Error('Не удалось загрузить приглашения');
  const rows = await Promise.all((r.data ?? []).map(async i => {
    const preview = await context.supabase.rpc('character_invitation', { _id: i.id });
    return preview.error ? null : preview.data;
  }));
  return rows.filter(r => r !== null) as { id: string; characterId: string; ownerName: string; permissions: Permissions; expiresAt: string }[];
});
export const invitationAction = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(v => z.object({ id: z.string().uuid().optional(), token: z.string().min(40).max(128).optional(), action: z.enum(['preview', 'accept', 'decline']) }).refine(v => !!v.id || !!v.token).parse(v)).handler(async ({ data, context }) => {
  const r = await context.supabase.rpc('character_invitation', { ...(data.id ? { _id: data.id } : {}), _token: data.token ?? '', _action: data.action });
  if (r.error) throw new Error('Приглашение недействительно или уже использовано');
  return r.data as { id: string; characterId: string; ownerName: string; permissions: Permissions; expiresAt: string };
});

const actionSchema = z.object({ id: z.string().min(1), version: z.string(), action: z.enum(['primaryExp','secondaryExp','notes','bio','addItem','editItem','removeItem','equip','unequip','swap','money','use','activate','end']), name: z.string().optional(), amount: z.number().int().optional(), itemId: z.string().optional(), effectId: z.string().optional(), value: z.unknown().optional() });
export const sharedAction = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(v => actionSchema.parse(v)).handler(async ({ data, context }) => {
  const a = await permission(context.supabase, data.id);
  const action = data.action;
  const section = action === 'primaryExp' ? 'primary' : action === 'secondaryExp' ? 'secondary' : action === 'notes' ? 'notes' : action === 'bio' ? 'bio' : 'inventory';
  if (!canShareAction(a.permissions, action === 'primaryExp' || action === 'secondaryExp' ? action : section === 'primary' ? 'primaryExp' : section === 'secondary' ? 'secondaryExp' : section)) throw new Error('Недостаточно прав');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const row = await supabaseAdmin.from('characters').select('data,updated_at').eq('id', data.id).single();
  if (!row.data || row.error) throw new Error('Персонаж недоступен');
  if (row.data.updated_at !== data.version) throw new Error('Персонаж изменился. Обновите данные и повторите действие');
  let c = normalizeCharacter(row.data.data); let log = '';
  if (action === 'primaryExp' || action === 'secondaryExp') {
    const r = action === 'primaryExp' ? addPrimaryExp(c, data.name ?? '', data.amount ?? 0) : addSecondaryExp(c, data.name ?? '', data.amount ?? 0);
    if (r.error) throw new Error(r.error); c = r.character; log = `${data.name}: ${data.amount} опыта`;
  } else if (action === 'notes') {
    c.notes = z.array(z.object({ id:z.string(),at:z.string(),title:z.string().max(120),text:z.string().max(100000) })).max(1000).parse(data.value); log = 'Изменены заметки';
  } else if (action === 'bio') {
    const bio = z.object({ name:z.string().min(1).max(120),race:z.string().max(120),characterClass:z.string().max(120),avatar:z.string().max(15000000) }).parse(data.value); c={...c,...bio}; log='Изменены основные сведения';
  } else if (action === 'use') { const r=useItem(c,data.itemId ?? '',data.effectId); if(r.error)throw new Error(r.error); c=r.character; log='Использован предмет';
  } else if(action==='activate'){c=activateEquipmentEffect(c,data.itemId ?? '',data.effectId ?? '');log='Включён эффект';
  } else if(action==='end'){c=endEffect(c,data.effectId ?? '');log='Завершён эффект';
  } else if (action === 'addItem' || action === 'editItem') {
    const raw=z.object({name:z.string().min(1),category:z.enum(['gear','consumable','misc'])}).passthrough().parse(data.value);
    const normalized=normalizeCharacter({...c,inventory:{...c.inventory,items:[{...raw,id:action==='addItem'?uid():data.itemId} as unknown as Item]}}).inventory.items[0];
    if(!normalized)throw new Error('Некорректный предмет');
    for(const path of [normalized.image,normalized.thumb])if(path && !path.startsWith(`${context.userId}/`) && !c.inventory.items.some(i=>i.image===path||i.thumb===path))throw new Error('Изображение недоступно');
    if(action==='editItem'&&!c.inventory.items.some(i=>i.id===data.itemId))throw new Error('Предмет недоступен');
    c.inventory=action==='addItem'?addItem(c.inventory,normalized).inventory:upsertItem(c.inventory,normalized);log=action==='addItem'?'Добавлен предмет':'Изменён предмет';
  } else if(action==='removeItem'){c.inventory=removeItem(c.inventory,data.itemId ?? '');log='Удалён предмет';
  } else if(action==='money'){ const k=z.enum(['copper','silver','gold','platinum']).parse(data.name) as keyof Money; c.inventory=setMoney(c.inventory,k,data.amount ?? 0);log='Изменены деньги';
  } else {
    const r=action==='equip'?autoEquip(c.inventory,data.itemId ?? ''):action==='unequip'?unequip(c.inventory,data.itemId ?? ''):swapWeapons(c.inventory);
    if(r.error)throw new Error(r.error);c.inventory=r.inventory;log=r.log ?? 'Изменена экипировка';
  }
  c=reconcileEffects(c);
  const sections=action==='secondaryExp'?['primary','secondary']:[section];
  const profile=await context.supabase.from('profiles').select('display_name').eq('id',context.userId).single();
  const saved=await supabaseAdmin.rpc('commit_character_section',{_id:data.id,_actor:context.userId,_expected:data.version,_data:json(c),_sections:sections,_log:`${profile.data?.display_name || 'Участник'}: ${log}`});
  if(saved.error)throw new Error(saved.error.message.includes('CONFLICT')?'Персонаж изменился. Обновите данные и повторите действие':'Не удалось сохранить: доступ изменён');
  return {ok:true};
});

export const saveOwnedCharacter = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({character:z.unknown(),version:z.string().nullable()}).parse(v)).handler(async({data,context})=>{
  const active=await context.supabase.rpc('account_active');if(active.error||!active.data)throw new Error('Доступ закрыт');
  const c=reconcileEffects(normalizeCharacter(data.character));c.updatedAt=new Date().toISOString();
  const row={id:c.id,owner_id:context.userId,name:c.name,data:json(c),updated_at:c.updatedAt};
  const r=data.version
    ? await context.supabase.from('characters').update({name:row.name,data:row.data,updated_at:row.updated_at}).eq('id',c.id).eq('owner_id',context.userId).eq('updated_at',data.version).select('data,updated_at').maybeSingle()
    : await context.supabase.from('characters').insert(row).select('data,updated_at').single();
  if(r.error||!r.data)throw new Error('Персонаж изменился или доступ закрыт. Обновите данные и повторите сохранение');
  return {character:normalizeCharacter(r.data.data),version:r.data.updated_at};
});