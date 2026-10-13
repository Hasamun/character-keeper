import { z } from 'zod';
import { CLASSES, RACES, PRIMARY_STAT_NAMES, SECONDARY_SKILLS, uid, type Character } from './index';
import { normalizeCharacter } from '../storage';
import { normalizeInventory, SLOTS, SLOT_KIND_LABELS, type Item } from './inventory';
import { EFFECT_KIND_LABELS, RANKS } from './items';

export const TRANSFER_LIMITS = { file: 25 * 1024 * 1024, expanded: 100 * 1024 * 1024, entries: 1000, records: 500 };
const integer = z.number().int().safe();
const text = z.string().max(100000);
const identifier = z.string().min(1).max(128);
const enumKeys = (v: Record<string, unknown>) => z.string().refine(s => Object.hasOwn(v,s), 'Неизвестное значение');
const effect = z.object({ id: identifier.optional(), kind: enumKeys(EFFECT_KIND_LABELS), target: text.optional(), value: integer.optional(), automation: z.enum(['auto','confirm','manual']).optional(), charges: integer.nonnegative().optional(), remainingCharges: integer.nonnegative().optional(), description:text.optional(), condition:text.optional(), duration:text.optional(), damageType:text.optional() }).strict().superRefine((e,ctx)=>{if(e.remainingCharges!=null&&(e.charges==null||e.remainingCharges>e.charges))ctx.addIssue({code:'custom',message:'Остаток зарядов превышает число зарядов'});});
export const itemSchema = z.object({ id:identifier.optional(), name:z.string().trim().min(1).max(120), category:z.enum(['gear','consumable','misc']), slot:enumKeys(SLOT_KIND_LABELS).optional(), quantity:integer.positive().optional(), description:text.optional(), beltCapacity:integer.min(1).max(4).optional(), rank:z.enum(RANKS).optional(), subtype:text.optional(), image:z.string().max(1024).optional(), thumb:z.string().max(1024).optional(), lore:text.optional(), weapon:z.object({damage:text,attackBonus:integer,damageType:text,attackMode:z.enum(['fixed','str','dex','best','sum']),twoHanded:z.boolean()}).strict().optional(), armor:z.object({ac:integer,armorType:text}).strict().optional(), weight:z.number().finite().nonnegative().optional(),price:integer.nonnegative().optional(), requirements:z.array(z.object({stat:z.enum(PRIMARY_STAT_NAMES),min:integer})).max(100).optional(),effects:z.array(effect).max(100).optional(),author:text.optional(),source:text.optional(),notes:text.optional(),history:z.array(z.object({at:text,text})).max(100).optional(),createdAt:text.optional() }).strict();
const stat = (min:number,maxSub:number) => z.object({level:integer.min(min).max(10),subIndex:integer.min(0).max(maxSub).optional(),sub_index:integer.min(0).max(maxSub).optional(),progress:integer.nonnegative().optional()}).strict();
const entry = z.union([text,z.object({id:identifier.optional(),at:text.optional(),text,title:text.optional()}).strict()]);
const characterSchema = z.object({id:identifier.optional(),name:z.string().trim().min(1).max(120),race:enumKeys(RACES).optional(),characterClass:enumKeys(CLASSES).optional(),class:enumKeys(CLASSES).optional(),avatar:z.string().max(15000000).optional(),icon:z.string().max(15000000).optional(),primary:z.record(stat(-6,4)).optional(),secondary:z.record(stat(-5,2)).optional(),log:z.array(entry).max(5000).optional(),notes:z.array(entry).max(1000).optional(),inventory:z.object({items:z.array(itemSchema).max(5000).optional(),money:z.object({copper:integer.nonnegative().optional(),silver:integer.nonnegative().optional(),gold:integer.nonnegative().optional(),platinum:integer.nonnegative().optional()}).strict().optional(),equipped:z.record(z.string().nullable()).optional(),weaponSets:z.array(z.object({main:z.string().nullable(),off:z.string().nullable()}).strict()).length(2).optional(),activeSet:z.union([z.literal(0),z.literal(1)]).optional(),belt:z.array(z.string().nullable()).max(4).optional()}).strict().optional(),activeEffects:z.array(z.object({id:identifier,sourceItemId:identifier,sourceName:text,effect,equipmentBound:z.boolean()}).strict()).max(1000).optional(),createdAt:text.optional(),updatedAt:text.optional()}).strict();
export type TransferRecord = { kind:'character'; value:Character; warnings:string[] } | {kind:'item';value:Item;warnings:string[]};
export function safeArchivePath(path:string) { return !!path && !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && !path.split('/').some(p=>p==='..'||p==='.'||!p) && !/[\u0000-\u001f]/.test(path); }
export function validImageRef(path:string) { return path.startsWith('asset:') ? safeArchivePath(path.slice(6)) : /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path) || /^catalog:[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path); }
function images(items:Item[]) { for(const i of items)for(const p of [i.image,i.thumb])if(p&&!validImageRef(p))throw new Error('Недопустимый путь изображения'); }
function duplicates(ids:string[],label:string) { if(new Set(ids).size!==ids.length)throw new Error(`Повторяющийся идентификатор: ${label}`); }
export function validateRecord(raw:unknown):TransferRecord {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Ожидается персонаж или предмет');
  if('category' in raw){const r=itemSchema.parse(raw);const i=normalizeInventory({items:[{...r,id:r.id??uid()}]}).items[0];if(!i)throw new Error('Некорректный предмет');images([i]);return {kind:'item',value:i,warnings:r.id?[]:['Будет назначен идентификатор']};}
  const r=characterSchema.parse(raw);const warnings:string[]=[];
  if(!r.primary||!r.secondary)warnings.push('Отсутствующие характеристики и навыки будут заполнены базовыми значениями');
  for(const n of Object.keys(r.primary??{}))if(!PRIMARY_STAT_NAMES.includes(n as typeof PRIMARY_STAT_NAMES[number]))throw new Error(`Неизвестная характеристика: ${n}`);
  for(const n of Object.keys(r.secondary??{}))if(!SECONDARY_SKILLS.includes(n))throw new Error(`Неизвестный навык: ${n}`);
  if(r.class||r.icon||Object.values({...r.primary,...r.secondary}).some(s=>s.sub_index!=null)||r.notes?.some(n=>typeof n==='string'))warnings.push('Прежний формат будет преобразован без изменения правил');
  const avatar=r.avatar??r.icon;if(avatar&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))throw new Error('Аватар должен быть PNG, JPEG или WebP');
  const ids=(r.inventory?.items??[]).flatMap(i=>i.id?[i.id]:[]);duplicates(ids,'предмет');
  const refs=[...Object.values(r.inventory?.equipped??{}),...(r.inventory?.weaponSets??[]).flatMap(s=>[s.main,s.off]),...(r.inventory?.belt??[])];
  if(refs.some(id=>id&&!ids.includes(id)))throw new Error('Экипировка ссылается на отсутствующий предмет');
  if(Object.keys(r.inventory?.equipped??{}).some(k=>!SLOTS.some(s=>s.id===k)))throw new Error('Неизвестный слот экипировки');
  for(const a of r.activeEffects??[])if(a.equipmentBound&&(!ids.includes(a.sourceItemId)||!r.inventory?.items?.find(i=>i.id===a.sourceItemId)?.effects?.some(e=>e.id===a.effect.id)))throw new Error('Эффект снаряжения ссылается на отсутствующий предмет или эффект');
  if(r.inventory?.items)r.inventory.items=r.inventory.items.map(i=>({...i,id:i.id??uid()}));
  const c=normalizeCharacter(r);images(c.inventory.items);
  if(JSON.stringify(c.inventory.belt)!==JSON.stringify(r.inventory?.belt??[]))throw new Error('Пояс не соответствует предмету или ёмкости');
  return {kind:'character',value:c,warnings};
}
export function cloneCharacter(c:Character,newId=uid()):Character {
  const copy=structuredClone(c);copy.id=newId;
  const map=new Map<string,string>();const remap=(id:string)=>{let n=map.get(id);if(!n){n=uid();map.set(id,n);}return n;};
  const effectMap=new Map<string,string>();const eff=(item:string,id:string)=>{const key=item+':'+id;let n=effectMap.get(key);if(!n){n=uid();effectMap.set(key,n);}return n;};
  copy.inventory.items=copy.inventory.items.map(i=>({...i,id:remap(i.id),effects:i.effects?.map(e=>({...e,id:eff(i.id,e.id),target:map.get(e.target)??e.target}))}));
  const ref=(s:string|null)=>s?remap(s):null;
  copy.inventory.equipped=Object.fromEntries(Object.entries(copy.inventory.equipped).map(([k,v])=>[k,ref(v)])) as Character['inventory']['equipped'];
  copy.inventory.weaponSets=copy.inventory.weaponSets.map(s=>({main:ref(s.main),off:ref(s.off)})) as Character['inventory']['weaponSets'];copy.inventory.belt=copy.inventory.belt.map(ref);
  if(copy.activeEffects)copy.activeEffects=copy.activeEffects.map(a=>({...a,id:uid(),sourceItemId:remap(a.sourceItemId),effect:{...a.effect,id:eff(a.sourceItemId,a.effect.id),target:map.get(a.effect.target)??a.effect.target}}));
  return copy;
}
export function duplicateHint(r:TransferRecord,characters:Character[],items:Item[],seen:TransferRecord[]) {
 const matches=(r.kind==='character'?characters:items).filter(v=>v.id===r.value.id||v.name===r.value.name);
 return [...(matches.length?['Совпадение имени или идентификатора в назначении']:[]),...(seen.some(s=>s.kind===r.kind&&(s.value.id===r.value.id||s.value.name===r.value.name))?['Повтор внутри набора']:[])];
}
