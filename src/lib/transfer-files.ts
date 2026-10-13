import Papa from 'papaparse';
import { unzip, zip, strFromU8, strToU8 } from 'fflate';
import { TRANSFER_LIMITS, safeArchivePath, validateRecord, type TransferRecord } from './rules/transfer';
import type { Item } from './rules/inventory';
export type ParsedTransfer = { records:TransferRecord[]; errors:string[]; assets:Map<string,File> };
export const CSV_FIELDS = ['id','name','category','slot','quantity','description','rank','subtype','beltCapacity','weight','price','weapon','armor','effects','requirements','author','source','notes','history','createdAt','image','thumb','lore'];
const LABELS = ['Идентификатор','Название','Категория','Слот','Количество','Описание','Ранг','Подтип','Ёмкость пояса','Вес','Цена','Оружие JSON','Броня JSON','Эффекты JSON','Требования JSON','Автор','Источник','Заметки','История JSON','Создан','Изображение','Миниатюра','Легенда'];
const complex = new Set(['weapon','armor','effects','requirements','history']);
const numeric = new Set(['quantity','beltCapacity','weight','price']);
export function itemsCsv(items:Item[]) { return '\uFEFF'+Papa.unparse({fields:LABELS,data:items.map(i=>CSV_FIELDS.map(k=>{if(k==='image'||k==='thumb')return '';const v=(i as unknown as Record<string,unknown>)[k];return v==null?'':complex.has(k)?JSON.stringify(v):typeof v==='string'&&(/^['=+\-@\t\r]/.test(v)||v.startsWith('text-json:'))?'text-json:'+JSON.stringify(v):v;}))},{escapeFormulae:true}); }
export function parseCsv(text:string):unknown[] {
 const p=Papa.parse<Record<string,string>>(text.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:'greedy'});if(p.errors.length)throw new Error('Ошибка CSV: '+p.errors[0]?.message);
 const fields=p.meta.fields??[];if(fields.some(f=>!LABELS.includes(f)&&!CSV_FIELDS.includes(f)))throw new Error('Неизвестные заголовки CSV');
 return p.data.map(row=>Object.fromEntries(Object.entries(row).filter(([,v])=>v!=='').map(([label,v])=>{const k=CSV_FIELDS[LABELS.indexOf(label)]??label;return [k,complex.has(k)?JSON.parse(v):numeric.has(k)?Number(v):v.startsWith('text-json:')?JSON.parse(v.slice(10)):v];})));
}
function unpack(bytes:Uint8Array):Promise<Record<string,Uint8Array>> {
 let total=0,count=0;return new Promise((resolve,reject)=>unzip(bytes,{filter:entry=>{
 count++;total+=entry.originalSize;
 if(count>TRANSFER_LIMITS.entries||total>TRANSFER_LIMITS.expanded||!safeArchivePath(entry.name.replace(/\/$/,''))||/\.zip$/i.test(entry.name))throw new Error('Небезопасный или слишком большой архив');
 return !entry.name.endsWith('/');
 }},(err,data)=>err?reject(err):resolve(data)));
}
export async function parseTransferFiles(files:File[]):Promise<ParsedTransfer> {
 const out:ParsedTransfer={records:[],errors:[],assets:new Map()};let bytes=0;
 for(const file of files){try{
 bytes+=file.size;if(file.size>(file.name.toLowerCase().endsWith('.zip')?TRANSFER_LIMITS.expanded:TRANSFER_LIMITS.file)||bytes>TRANSFER_LIMITS.expanded)throw new Error('Превышен допустимый размер файлов');
 const ext=file.name.split('.').pop()?.toLowerCase();let raw:unknown;
 if(ext==='zip'){
 const entries=await unpack(new Uint8Array(await file.arrayBuffer()));const manifest=entries['manifest.json'];if(!manifest)throw new Error('В архиве отсутствует manifest.json');
 const doc=JSON.parse(strFromU8(manifest));if(doc.format!=='chronicle-transfer'||doc.version!==1||!Array.isArray(doc.records))throw new Error('Неизвестная версия архива');
 const prefix='images/'+crypto.randomUUID()+'/';
 const rename=new Map<string,string>();
 for(const [path,data] of Object.entries(entries)){if(path==='manifest.json')continue;if(!/^images\/.+\.(png|jpe?g|webp)$/i.test(path))throw new Error('Неподдерживаемый файл в архиве');const dest=prefix+path.split('/').pop();if(rename.has(path)||out.assets.has(dest))throw new Error('Повтор имени изображения');rename.set(path,dest);out.assets.set(dest,new File([data as BlobPart],dest,{type:/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg'}));}
 raw=doc.records.map((r:unknown)=>{const x=structuredClone(r) as Record<string,unknown>;const items='category' in x?[x]:(x['inventory'] as {items?:Record<string,unknown>[]} | undefined)?.items??[];for(const i of items)for(const k of ['image','thumb']){const p=i[k];if(typeof p==='string'&&p.startsWith('asset:')){const n=rename.get(p.slice(6));if(!n)throw new Error('Отсутствует изображение архива');i[k]='asset:'+n;}}return x;});
 } else if(ext==='csv')raw=parseCsv(await file.text());
 else if(ext==='json')raw=JSON.parse(await file.text());
 else if(['png','jpg','jpeg','webp'].includes(ext??'')){out.assets.set(file.name,file);continue;}
 else throw new Error('Поддерживаются JSON, CSV, ZIP, PNG, JPEG и WebP');
 const rows=Array.isArray(raw)?raw:raw&&typeof raw==='object'&&'records' in raw?(raw as {records:unknown[]}).records:raw&&typeof raw==='object'&&'characters' in raw?(raw as {characters:unknown[]}).characters:raw&&typeof raw==='object'&&'items' in raw?(raw as {items:unknown[]}).items:[raw];
 if(!Array.isArray(rows)||rows.length+out.records.length>TRANSFER_LIMITS.records)throw new Error('Не более 500 записей за одну операцию');
 rows.forEach((r,idx)=>{try{out.records.push(validateRecord(r));}catch(e){out.errors.push(`${file.name}, запись ${idx+1}: ${friendlyError(e)}`);}});
 }catch(e){out.errors.push(`${file.name}: ${friendlyError(e)}`);}}
 return out;
}
export function friendlyError(e:unknown) { if(e&&typeof e==='object'&&'issues' in e){const a=(e as {issues:{path:(string|number)[];message:string}[]}).issues;return a.slice(0,3).map(i=>`${i.path.join('.')}: ${i.message}`).join('; ');}return e instanceof Error?e.message:'Не удалось обработать файл'; }
export function downloadBlob(blob:Blob,name:string) { const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }
export async function deliverFile(blob:Blob,name:string) {const file=new File([blob],name,{type:blob.type});if(matchMedia('(pointer: coarse)').matches&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:name});return;}catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;}}downloadBlob(blob,name);}
export async function makeArchive(records:unknown[],assets:Map<string,Blob>):Promise<Blob> {
 if(records.length>TRANSFER_LIMITS.records||assets.size+1>TRANSFER_LIMITS.entries)throw new Error('Слишком много записей или изображений: выберите меньше героев');
 const entries:Record<string,Uint8Array>={'manifest.json':strToU8(JSON.stringify({format:'chronicle-transfer',version:1,createdAt:new Date().toISOString(),records},null,2))};
 let size=entries['manifest.json']?.length??0;if(size>TRANSFER_LIMITS.expanded)throw new Error('Копия больше 100 МБ: выберите меньше героев');for(const [path,b] of assets){if(!safeArchivePath(path))throw new Error('Некорректный путь');size+=b.size;if(size>TRANSFER_LIMITS.expanded)throw new Error('Копия больше 100 МБ: выберите меньше героев');entries[path]=new Uint8Array(await b.arrayBuffer());}
 const data=await new Promise<Uint8Array>((resolve,reject)=>zip(entries,{level:0},(e,d)=>e?reject(e):resolve(d)));return new Blob([data as BlobPart],{type:'application/zip'});
}
