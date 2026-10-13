import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { validateRecord } from './rules/transfer';
import { ownsImagePath } from './rules/sharing';
import { reconcileEffects } from './rules/derived';
import type { Json } from '@/integrations/supabase/types';
export const transferSnapshot=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const a=await context.supabase.rpc('account_active');if(a.error||!a.data)throw new Error('Доступ закрыт');
 const r=await context.supabase.from('characters').select('id,data,updated_at').eq('owner_id',context.userId).order('created_at');if(r.error)throw new Error('Не удалось прочитать сохранённых героев');return r.data;
});
export const importOwnedCharacter=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({character:z.unknown(),version:z.string().nullable()}).parse(v)).handler(async({data,context})=>{
 const a=await context.supabase.rpc('account_active');if(a.error||!a.data)throw new Error('Доступ закрыт');
 const r=validateRecord(data.character);if(r.kind!=='character')throw new Error('Ожидается персонаж');const c=reconcileEffects(r.value);
 for(const item of c.inventory.items)for(const path of [item.image,item.thumb])if(path){if(!ownsImagePath(path,context.userId))throw new Error('Изображение недоступно');const f=await context.supabase.storage.from('item-images').download(path);if(f.error||!f.data)throw new Error('Изображение отсутствует');}
 c.updatedAt=new Date().toISOString();const row={id:c.id,owner_id:context.userId,name:c.name,data:c as unknown as Json,updated_at:c.updatedAt};
 const saved=data.version?await context.supabase.from('characters').update({name:row.name,data:row.data,updated_at:row.updated_at}).eq('id',c.id).eq('owner_id',context.userId).eq('updated_at',data.version).select('data,updated_at').maybeSingle():await context.supabase.from('characters').insert(row).select('data,updated_at').single();
 if(saved.error||!saved.data)throw new Error('Персонаж изменился или доступ закрыт. Обновите предпросмотр');return {version:saved.data.updated_at,character:c};
});
