import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { catalogTemplate, catalogCopy, catalogSearch } from '@/lib/rules/catalog';
import { normalizeCharacter } from './storage';
import { addItem } from './rules/inventory';
import { pushLog, uid } from '@/lib/rules';
import type { Json } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
async function access(db: SupabaseClient<Database>, userId: string, admin = false) {
  const {data:active,error} = await db.rpc('account_active');
  if(error || !active) throw new Error('Аккаунт заблокирован или доступ недоступен');
  if(admin) { const {data:role,error:e}=await db.rpc('has_role',{_user_id:userId,_role:'admin'}); if(e || !role) throw new Error('Недостаточно прав'); }
}
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Json;
export const accountInfo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const [a,r]=await Promise.all([context.supabase.rpc('account_active'),context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'})]);
 if(a.error || r.error) throw new Error('Не удалось проверить доступ'); return {active:a.data===true,admin:r.data===true};
});
export const listCatalog = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:Record<string,unknown>)=>catalogSearch(d)).handler(async({data,context})=>{
 await access(context.supabase,context.userId);
 let q=context.supabase.from('catalog_items').select('*',{count:'exact'}).eq('archived',false);
 if(data.q) q=q.ilike('name',`%${data.q.replace(/[%_\\]/g,'')}%`);
 if(data.category!=='all')q=q.eq('category',data.category);
 if(data.rank!=='all')q=q.eq('rank',data.rank);
 if(data.slot!=='all')q=q.eq('slot',data.slot);
 if(data.subtype)q=q.ilike('subtype',`%${data.subtype.replace(/[%_\\]/g,'')}%`);
 // Rank order is explicit, not alphabetical.
 const column=data.sort==='name'?'name':data.sort==='rank'?'rank_order':data.sort==='price'?'price_value':'updated_at';
 const {data:rows,error,count}=await q.order(column,{ascending:data.sort!=='recent'}).order('id').range((data.page-1)*24,data.page*24-1);
 if(error)throw new Error('Не удалось загрузить каталог'); return {rows:rows??[],count:count??0};
});
export const getCatalog = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{id:string})=>d).handler(async({data,context})=>{
 await access(context.supabase,context.userId); const {data:row,error}=await context.supabase.from('catalog_items').select('*').eq('id',data.id).eq('archived',false).maybeSingle(); if(error||!row)throw new Error('Предмет недоступен'); return row;
});
export const listSubmissions = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{admin?:boolean;page?:number})=>({admin:d.admin===true,page:Math.max(1,Math.trunc(d.page??1))})).handler(async({data,context})=>{
 await access(context.supabase,context.userId,data.admin); let q=context.supabase.from('catalog_submissions').select('*',{count:'exact'});
 q=data.admin?q.eq('status','pending'):q.eq('owner_id',context.userId);
 const {data:rows,error,count}=await q.order('updated_at',{ascending:false}).range((data.page-1)*24,data.page*24-1); if(error)throw new Error('Не удалось загрузить предложения');return {rows:rows??[],count:count??0};
});
// Privileged storage copies only after caller authorization and source reads through caller RLS.
async function copyImages(db:SupabaseClient<Database>, raw:unknown, userId:string, destination:'catalog-images'|'item-images',itemId:string) {
 const i=destination==='catalog-images'?catalogTemplate(raw):catalogCopy(raw,itemId);
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const uploaded:string[]=[];
 try {
 for(const field of ['image','thumb'] as const){const path=i[field];if(!path)continue;
  const catalog=path.startsWith('catalog:');const source=catalog?'catalog-images':'item-images';const real=catalog?path.slice(8):path;
  if(!catalog&&!real.startsWith(`${userId}/`))throw new Error('Изображение недоступно');
  const {data:blob,error}=await db.storage.from(source).download(real);if(error||!blob)throw new Error('Не удалось скопировать изображение');
  if(blob.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(blob.type))throw new Error('Некорректное изображение');
  const dest=`${userId}/${itemId}/${uid()}-${field}.${blob.type.split('/')[1]}`;
  const upload=await supabaseAdmin.storage.from(destination).upload(dest,blob,{contentType:blob.type});if(upload.error)throw new Error('Не удалось скопировать изображение');uploaded.push(dest);i[field]=destination==='catalog-images'?`catalog:${dest}`:dest;
 }
 return {item:i,cleanup:()=>supabaseAdmin.storage.from(destination).remove(uploaded)};
 }catch(e){if(uploaded.length)await supabaseAdmin.storage.from(destination).remove(uploaded);throw e;}
}
export const submitCatalog = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{item:unknown;submissionId?:string;catalogId?:string})=>d).handler(async({data,context})=>{
 await access(context.supabase,context.userId);
 // Verify target before writing any copied files.
 if(data.submissionId){const {data:r}=await context.supabase.from('catalog_submissions').select('owner_id,status').eq('id',data.submissionId).maybeSingle();if(!r||r.owner_id!==context.userId||r.status==='approved')throw new Error('Предложение недоступно');}
 if(data.catalogId){const {data:r}=await context.supabase.from('catalog_items').select('owner_id').eq('id',data.catalogId).maybeSingle();const role=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(!r||r.owner_id!==context.userId&&!role.data)throw new Error('Предмет недоступен');}
 const copied=await copyImages(context.supabase,data.item,context.userId,'catalog-images',uid());
 const args={_data:asJson(copied.item),...(data.submissionId?{_submission_id:data.submissionId}:{}),...(data.catalogId?{_catalog_id:data.catalogId}:{})};
 const {data:id,error}=await context.supabase.rpc('submit_catalog',args);if(error){await copied.cleanup();throw new Error('Не удалось отправить предложение');}return {id};
});
export const addCatalogItem = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{catalogId:string;characterId:string})=>d).handler(async({data,context})=>{
 await access(context.supabase,context.userId);
 const {data:c}=await context.supabase.from('characters').select('*').eq('id',data.characterId).eq('owner_id',context.userId).maybeSingle();if(!c)throw new Error('Персонаж недоступен');
 const {data:r}=await context.supabase.from('catalog_items').select('data').eq('id',data.catalogId).eq('archived',false).maybeSingle();if(!r)throw new Error('Предмет недоступен');
 const copied=await copyImages(context.supabase,r.data,context.userId,'item-images',uid());
 try {
  const character=normalizeCharacter(c.data);
  character.inventory=addItem(character.inventory,copied.item).inventory;
  pushLog(character,`Добавлен из каталога «${copied.item.name}»`);
  character.updatedAt=new Date().toISOString();
  const saved=await context.supabase.from('characters').update({data:asJson(character),updated_at:character.updatedAt}).eq('id',c.id).eq('owner_id',context.userId).eq('updated_at',c.updated_at).select('id').maybeSingle();
  if(saved.error||!saved.data)throw new Error('Персонаж изменился. Обновите страницу и повторите добавление');
  return copied.item;
 }catch(e){await copied.cleanup();throw e;}
});
export const reviewCatalog = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{id:string;revision:number;approve:boolean;reason:string})=>d).handler(async({data,context})=>{
 await access(context.supabase,context.userId,true); const {error}=await context.supabase.rpc('review_catalog',{_id:data.id,_revision:data.revision,_approve:data.approve,_reason:data.reason});if(error)throw new Error(error.message.includes('уже')?'Предложение уже изменено или рассмотрено':'Не удалось сохранить решение');return {ok:true};
});
export const archiveCatalog = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{id:string;reason:string})=>d).handler(async({data,context})=>{
 await access(context.supabase,context.userId,true);const {error}=await context.supabase.rpc('archive_catalog',{_id:data.id,_reason:data.reason});if(error)throw new Error('Не удалось архивировать предмет');return {ok:true};
});
export const adminAccounts = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{q?:string;page?:number})=>({q:(d.q??'').slice(0,120),page:Math.max(1,Math.trunc(d.page??1))})).handler(async({data,context})=>{
 await access(context.supabase,context.userId,true);let q=context.supabase.from('profiles').select('*',{count:'exact'});if(data.q)q=q.ilike('display_name',`%${data.q.replace(/[%_\\]/g,'')}%`);const r=await q.order('created_at',{ascending:false}).range((data.page-1)*24,data.page*24-1);if(r.error)throw new Error('Не удалось загрузить аккаунты');return {rows:r.data??[],count:r.count??0,userId:context.userId};
});
export const blockAccount = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{id:string;blocked:boolean;reason:string})=>d).handler(async({data,context})=>{
 await access(context.supabase,context.userId,true);const {error}=await context.supabase.rpc('set_account_block',{_id:data.id,_blocked:data.blocked,_reason:data.reason});if(error)throw new Error(error.message);return {ok:true};
});
export const auditLogs = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:{page?:number})=>({page:Math.max(1,Math.trunc(d.page??1))})).handler(async({data,context})=>{await access(context.supabase,context.userId,true);const r=await context.supabase.from('admin_audit').select('*',{count:'exact'}).order('created_at',{ascending:false}).range((data.page-1)*24,data.page*24-1);if(r.error)throw new Error('Журнал недоступен');return {rows:r.data??[],count:r.count??0};});
