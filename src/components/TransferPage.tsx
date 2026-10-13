import {useEffect,useRef,useState} from 'react';
import {Link} from '@tanstack/react-router';
import {useServerFn} from '@tanstack/react-start';
import {ArrowLeft,Download,Upload,Archive,FileImage,RefreshCw,Square} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {toast} from 'sonner';
import {useCharacters} from '@/lib/characters-store';
import {transferSnapshot,importOwnedCharacter} from '@/lib/transfer.functions';
import {submitCatalog} from '@/lib/catalog.functions';
import {cloneCharacter,duplicateHint,type TransferRecord} from '@/lib/rules/transfer';
import {normalizeCharacter} from '@/lib/storage';
import {uid,type Character} from '@/lib/rules';
import {addItem,type Item} from '@/lib/rules/inventory';
import {deliverFile,friendlyError,itemsCsv,parseTransferFiles,type ParsedTransfer} from '@/lib/transfer-files';
import {attachImage,avatarImage,cardPng,cleanupImportedImages,portableArchive,prepareImportedImages} from '@/lib/transfer-media';

type Row={record:TransferRecord;action:'copy'|'skip'|'replace';target:string;result?:string;done?:boolean;commitId:string;};
type Snapshot={id:string;data:unknown;updated_at:string}[];
const empty:ParsedTransfer={records:[],errors:[],assets:new Map()};
const selectClass='h-10 max-w-full rounded border border-input bg-background px-3 text-sm';
export function TransferPage({initialId}:{initialId?:string}){
 const store=useCharacters();const snapshotFn=useServerFn(transferSnapshot);const saveFn=useServerFn(importOwnedCharacter);const catalogFn=useServerFn(submitCatalog);
 const [tab,setTab]=useState<'import'|'export'|'backup'>(initialId?'export':'import');const [snapshot,setSnapshot]=useState<Snapshot>([]);const [rows,setRows]=useState<Row[]>([]);const [parsed,setParsed]=useState(empty);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const cancel=useRef(false);const files=useRef<HTMLInputElement>(null);
 const [destination,setDestination]=useState(initialId??'');const [itemDestination,setItemDestination]=useState<'inventory'|'catalog'>('inventory');const [omit,setOmit]=useState(false);const [selected,setSelected]=useState<string[]>(initialId?[initialId]:[]);const [exportKind,setExportKind]=useState<'characters'|'items'>('characters');const [format,setFormat]=useState<'json'|'zip'|'csv'|'png'>('zip');const [exportItem,setExportItem]=useState('');const [output,setOutput]=useState<{blob:Blob;name:string}|null>(null);const [consent,setConsent]=useState(false);const [imageFile,setImageFile]=useState('');const [imageItem,setImageItem]=useState('avatar');
 const heroes=snapshot.map(r=>normalizeCharacter(r.data));const target=heroes.find(c=>c.id===destination);const exportHero=heroes.find(c=>selected.includes(c.id));
 const refresh=async()=>{await store.flush();const r=await snapshotFn();setSnapshot(r);return r;};
 useEffect(()=>{void refresh().catch(e=>toast.error(friendlyError(e)));},[]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);cancel.current=false;setOutput(null);try{await fn();}catch(e){toast.error(friendlyError(e));setProgress(friendlyError(e));}finally{setBusy(false);}};
 const readFiles=(list:File[])=>run(async()=>{setProgress('Чтение файлов');const r=await parseTransferFiles(list);setParsed(r);setRows(r.records.map(record=>({record,action:'copy',target:'',commitId:uid()})));setProgress(`Записей: ${r.records.length}; ошибок: ${r.errors.length}`);});
 const update=(index:number,patch:Partial<Row>)=>setRows(l=>l.map((r,i)=>i===index?{...r,...patch}:r));
 const perform=()=>run(async()=>{
 let saved=0;
 for(let idx=0;idx<rows.length;idx++){if(cancel.current)break;const row=rows[idx];if(row.done||row.action==='skip')continue;const uploaded:string[]=[];
 setProgress(`${idx+1} / ${rows.length}: ${row.record.value.name}`);
 try{
 if(row.record.kind==='character'){
 const original=row.record.value;const id=row.action==='replace'?row.target:row.commitId;
 const existing=row.action==='replace'?snapshot.find(r=>r.id===id):undefined;if(row.action==='replace'&&!existing)throw new Error('Выберите своего героя для замены');
 if(row.action==='replace'&&!window.confirm(`Заменить данные «${heroes.find(c=>c.id===id)?.name}» данными «${original.name}»?`)){continue;}
 const c=row.action==='copy'?cloneCharacter(original,id):{...structuredClone(original),id};
 await prepareImportedImages(c.inventory.items,parsed.assets,omit,uploaded);
 await saveFn({data:{character:c,version:existing?.updated_at??null}});
 }else{
 const item=structuredClone(row.record.value);item.id=row.commitId;await prepareImportedImages([item],parsed.assets,omit,uploaded);
 if(itemDestination==='catalog'){await catalogFn({data:{item}});await cleanupImportedImages(uploaded);uploaded.length=0;}
 else {if(!destination)throw new Error('Выберите своего героя');const current=await snapshotFn();const s=current.find(c=>c.id===destination);if(!s)throw new Error('Персонаж недоступен');const expected=snapshot.find(c=>c.id===destination);if(!expected||expected.updated_at!==s.updated_at)throw new Error('Персонаж изменился. Обновите предпросмотр');const c=normalizeCharacter(s.data);c.inventory=addItem(c.inventory,item).inventory;const savedRow=await saveFn({data:{character:c,version:s.updated_at}});const next={id:c.id,data:savedRow.character,updated_at:savedRow.version};setSnapshot(l=>l.map(x=>x.id===c.id?next:x));const local=snapshot.find(x=>x.id===c.id);if(local){local.updated_at=next.updated_at;local.data=next.data;}}
 }
 update(idx,{done:true,result:itemDestination==='catalog'&&row.record.kind==='item'?'Предложение отправлено':'Сохранено'});saved++;
 }catch(e){await cleanupImportedImages(uploaded);update(idx,{result:friendlyError(e)});}
 }
 await store.refresh();await refresh();setProgress(`Сохранено: ${saved}${cancel.current?' · Остановлено':''}`);
 });
 const exportFile=()=>run(async()=>{
 const fresh=await refresh();const picked=fresh.filter(r=>selected.includes(r.id)).map(r=>normalizeCharacter(r.data));if(!picked.length)throw new Error('Выберите героев');
 const records:(Character|Item)[]=exportKind==='items'?picked.flatMap(c=>c.inventory.items):picked;if(!records.length)throw new Error('Нет предметов для экспорта');
 let blob:Blob;let ext=format;
 if(tab==='backup'||format==='zip'){if(tab==='backup'&&!consent)throw new Error('Подтвердите сохранение личных данных');blob=await portableArchive(records,setProgress,()=>cancel.current);ext='zip';}
 else if(format==='png'){const value=exportKind==='items'?records.find(i=>i.id===exportItem):picked[0];if(!value||exportKind==='characters'&&picked.length!==1)throw new Error('Выберите одну карточку');blob=await cardPng(value);}
 else if(format==='csv'){if(exportKind!=='items')throw new Error('CSV предназначен для предметов');blob=new Blob([itemsCsv(records as Item[])],{type:'text/csv;charset=utf-8'});}
 else {const stripped=structuredClone(records);for(const r of stripped)for(const i of 'inventory' in r?r.inventory.items:[r]){delete i.image;delete i.thumb;}blob=new Blob([JSON.stringify(stripped.length===1?stripped[0]:stripped,null,2)],{type:'application/json'});}
 setOutput({blob,name:`letopis-${tab==='backup'?'backup':'export'}-${new Date().toISOString().slice(0,10)}.${ext}`});setProgress('Файл готов');
 });
 const saveImage=()=>run(async()=>{const file=parsed.assets.get(imageFile);if(!file||!target)throw new Error('Выберите картинку и героя');const s=snapshot.find(x=>x.id===target.id);if(!s)throw new Error('Персонаж недоступен');const c=structuredClone(target);const uploaded:string[]=[];try{if(imageItem==='avatar')c.avatar=await avatarImage(file);else{const i=c.inventory.items.find(i=>i.id===imageItem);if(!i)throw new Error('Выберите предмет');await attachImage(i,file,uploaded);}await saveFn({data:{character:c,version:s.updated_at}});await store.refresh();await refresh();setProgress('Изображение сохранено');}catch(e){await cleanupImportedImages(uploaded);throw e;}});
 return <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
 <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Все герои</Link>
 <header className="my-6"><h1 className="text-3xl font-bold text-gold">Перенос и копии</h1></header>
 <nav className="flex flex-wrap gap-2 border-b border-border pb-4">{([['import','Импорт',Upload],['export','Экспорт',Download],['backup','Резервная копия',Archive]] as const).map(([id,label,Icon])=><Button key={id} variant={tab===id?'gold':'outline'} disabled={busy} onClick={()=>{setTab(id);setOutput(null);setProgress('');}}><Icon/>{label}</Button>)}</nav>
 {tab==='import'?<section className="space-y-5 py-6">
 <div className="flex flex-wrap gap-3"><Button variant="gold" disabled={busy} onClick={()=>files.current?.click()}><Upload/>Выбрать файлы</Button><Button variant="outline" onClick={()=>void deliverFile(new Blob([itemsCsv([{id:'example',name:'Название предмета',category:'gear',quantity:1,description:'Описание',rank:'F'}])],{type:'text/csv;charset=utf-8'}),'items-example.csv')}><Download/>Образец CSV</Button><Button variant="ghost" disabled={busy} onClick={()=>void run(async()=>{await refresh();setProgress('Предпросмотр обновлён');})}><RefreshCw/>Обновить предпросмотр</Button></div>
 <input ref={files} type="file" multiple accept=".json,.csv,.zip,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e=>{void readFiles(Array.from(e.target.files??[]));e.target.value='';}}/>
 {parsed.errors.length>0&&<div className="border-l-2 border-destructive pl-4"><h2 className="font-semibold text-destructive">Ошибки файлов</h2>{parsed.errors.map((e,i)=><p className="mt-2 break-words text-sm" key={i}>{e}</p>)}</div>}
 {rows.some(r=>r.record.kind==='item')&&<div className="flex flex-wrap items-center gap-3"><label>Предметы в <select className={selectClass} disabled={busy} value={itemDestination} onChange={e=>setItemDestination(e.target.value as typeof itemDestination)}><option value="inventory">Инвентарь</option><option value="catalog">Предложения каталога</option></select></label>{itemDestination==='inventory'&&<select aria-label="Герой для предметов" className={selectClass} value={destination} disabled={busy} onChange={e=>setDestination(e.target.value)}><option value="">Выберите героя</option>{heroes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>}
 {rows.length>0&&<label className="flex items-center gap-2 text-sm"><Checkbox disabled={busy} checked={omit} onCheckedChange={v=>setOmit(v===true)}/>Перенести без изображений предметов</label>}
 <div className="divide-y divide-border">{rows.map((row,idx)=>{const warnings=[...row.record.warnings,...duplicateHint(row.record,heroes,target?.inventory.items??[],rows.slice(0,idx).map(x=>x.record))];return <article key={idx} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words font-semibold">{row.record.value.name}</h2><p className="text-sm text-muted-foreground">{row.record.kind==='character'?`Персонаж · ${row.record.value.race} · ${row.record.value.inventory.items.length} предметов`:`Предмет · ${row.record.value.category} · ${row.record.value.quantity} шт.`}</p></div><select aria-label={`Действие ${idx+1}`} disabled={busy||row.done} className={selectClass} value={row.action} onChange={e=>update(idx,{action:e.target.value as Row['action']})}><option value="copy">{row.record.kind==='character'?'Новая копия':'Добавить'}</option><option value="skip">Пропустить</option>{row.record.kind==='character'&&<option value="replace">Заменить своего героя</option>}</select></div>{row.action==='replace'&&<select aria-label={`Заменяемый герой ${idx+1}`} className={selectClass+' mt-3'} disabled={busy||row.done} value={row.target} onChange={e=>update(idx,{target:e.target.value})}><option value="">Выберите героя</option>{heroes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}{warnings.map((w,i)=><p className="mt-2 text-sm text-gold" key={i}>{w}</p>)}{row.result&&<p className={`mt-2 break-words text-sm ${row.done?'text-primary':'text-destructive'}`}>{row.result}</p>}</article>;})}</div>
 {rows.length>0&&<Button variant="gold" disabled={busy||rows.every(r=>r.done||r.action==='skip')} onClick={()=>void perform()}><Upload/>Подтвердить импорт</Button>}
 {parsed.assets.size>0&&<section className="border-t border-border pt-5"><h2 className="mb-3 text-xl text-gold">Назначить изображение</h2><div className="flex flex-wrap gap-3"><select aria-label="Файл изображения" className={selectClass} value={imageFile} onChange={e=>setImageFile(e.target.value)}><option value="">Выберите файл</option>{[...parsed.assets.keys()].map(p=><option key={p} value={p}>{p}</option>)}</select><select aria-label="Герой для изображения" className={selectClass} value={destination} onChange={e=>{setDestination(e.target.value);setImageItem('avatar');}}><option value="">Выберите героя</option>{heroes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Назначение изображения" className={selectClass} value={imageItem} onChange={e=>setImageItem(e.target.value)}><option value="avatar">Аватар персонажа</option>{target?.inventory.items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select><Button variant="outline" disabled={busy||!imageFile||!target} onClick={()=>void saveImage()}><FileImage/>Сохранить изображение</Button></div></section>}
 </section>:<section className="space-y-5 py-6">
 <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={()=>setSelected(heroes.map(c=>c.id))}>Выбрать всех</Button><Button variant="ghost" disabled={busy} onClick={()=>setSelected([])}>Снять выбор</Button></div>
 <div className="divide-y divide-border">{heroes.map(c=><label key={c.id} className="flex items-center gap-3 py-4"><Checkbox checked={selected.includes(c.id)} disabled={busy} onCheckedChange={v=>setSelected(l=>v===true?[...l,c.id]:l.filter(id=>id!==c.id))}/><span className="min-w-0 break-words">{c.name}<span className="ml-3 text-sm text-muted-foreground">{c.inventory.items.length} предметов</span></span></label>)}</div>
 {tab==='export'?<><div className="flex flex-wrap items-center gap-3"><select aria-label="Состав экспорта" className={selectClass} value={exportKind} disabled={busy} onChange={e=>{setExportKind(e.target.value as typeof exportKind);setFormat('zip');}}><option value="characters">Персонажи</option><option value="items">Набор предметов</option></select><select aria-label="Формат экспорта" className={selectClass} value={format} disabled={busy} onChange={e=>setFormat(e.target.value as typeof format)}><option value="zip">ZIP с изображениями</option><option value="json">JSON без изображений предметов</option>{exportKind==='items'&&<option value="csv">CSV</option>}<option value="png">Карточка PNG</option></select>{format==='png'&&exportKind==='items'&&<select aria-label="Предмет для карточки" className={selectClass} value={exportItem} onChange={e=>setExportItem(e.target.value)}><option value="">Выберите предмет</option>{heroes.filter(c=>selected.includes(c.id)).flatMap(c=>c.inventory.items.map(i=><option key={c.id+i.id} value={i.id}>{c.name} · {i.name}</option>))}</select>}</div>{format==='json'&&<p className="text-sm text-muted-foreground">Картинки предметов не включены. Для полного переноса выберите ZIP.</p>}{format==='csv'&&<p className="text-sm text-muted-foreground">Картинки не включены; эффекты и требования сохраняются в JSON-полях.</p>}</>:<><p className="text-sm text-muted-foreground">ZIP с данными выбранных собственных героев и их изображениями. Приглашения, права участников и настройки аккаунта не включены.</p><label className="flex items-start gap-3"><Checkbox checked={consent} onCheckedChange={v=>setConsent(v===true)}/><span className="text-sm">Архив содержит личные данные. Я сохраню его в безопасном месте.</span></label></>}
 <Button variant="gold" disabled={busy||!selected.length||tab==='backup'&&!consent} onClick={()=>void exportFile()}><Archive/>{tab==='backup'?'Создать резервную копию':'Подготовить файл'}</Button>
 {tab==='backup'&&<Button variant="outline" disabled={busy} onClick={()=>{setTab('import');files.current?.click();}}><Upload/>Восстановить из файла</Button>}
 </section>}
 <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-4" aria-live="polite"><p className="min-w-0 break-words text-sm text-muted-foreground">{progress}</p>{busy&&<Button variant="outline" onClick={()=>{cancel.current=true;setProgress('Остановка после текущей записи');}}><Square/>Остановить</Button>}{output&&<Button variant="gold" onClick={()=>void deliverFile(output.blob,output.name)}><Download/>Скачать {output.name.split('.').pop()?.toUpperCase()}</Button>}</footer>
 </main>;
}
