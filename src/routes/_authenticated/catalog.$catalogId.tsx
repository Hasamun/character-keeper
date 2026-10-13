import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { CatalogNav,CatalogError,CatalogNotFound,ItemDetails } from '@/components/CatalogShared';
import { CatalogProposalEditor } from '@/components/CatalogProposalEditor';
import { catalogItemQuery,accountQuery,contentHead } from '@/lib/catalog-queries';
import { addCatalogItem,archiveCatalog } from '@/lib/catalog.functions';
import { useCharacters } from '@/lib/characters-store';
import { addItem,normalizeInventory,type Item } from '@/lib/rules/inventory';
import { pushLog } from '@/lib/rules';
export const Route=createFileRoute('/_authenticated/catalog/$catalogId')({loader:async({context,params})=>{await Promise.all([context.queryClient.ensureQueryData(catalogItemQuery(params.catalogId)),context.queryClient.ensureQueryData(accountQuery())]);},head:()=>contentHead('Предмет каталога','Параметры и эффекты каталожного предмета.'),component:CatalogDetail,errorComponent:CatalogError,notFoundComponent:CatalogNotFound});
function CatalogDetail(){const {catalogId}=Route.useParams();const {data:r}=useSuspenseQuery(catalogItemQuery(catalogId));const {data:access}=useSuspenseQuery(accountQuery());const {characters,upsert}=useCharacters();const [heroId,setHeroId]=useState('');const [editing,setEditing]=useState<Item|null>(null);const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const add=useServerFn(addCatalogItem);const archive=useServerFn(archiveCatalog);const qc=useQueryClient();const i=normalizeInventory({items:[r.data]}).items[0];if(!i)return <CatalogNotFound/>;
 return <main className="mx-auto max-w-3xl px-4 py-6 pb-24"><CatalogNav/><h1 className="mb-5 text-3xl text-gold">Предмет каталога</h1><ItemDetails item={i}/><div className="my-6 grid gap-3 border-y border-border py-5"><Select value={heroId} onValueChange={setHeroId}><SelectTrigger aria-label="Персонаж"><SelectValue placeholder="Выберите персонажа"/></SelectTrigger><SelectContent>{characters.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><Button variant="gold" disabled={!heroId||busy} onClick={async()=>{const c=characters.find(c=>c.id===heroId);if(!c)return;setBusy(true);try{const item=await add({data:{catalogId,characterId:heroId}});const next={...c,inventory:addItem(c.inventory,item).inventory,log:[...c.log]};pushLog(next,`Добавлен из каталога «${item.name}»`);await upsert(next);toast.success(`Добавлено: ${c.name}`);}catch(e){toast.error(e instanceof Error?e.message:'Не удалось добавить');}finally{setBusy(false);}}}>Добавить персонажу</Button></div><Button variant="outline" onClick={()=>setEditing(i)}>Предложить изменение</Button>{access.admin&&<div className="mt-6 grid gap-3 border-t border-border pt-4"><Input placeholder="Причина архивирования" value={reason} onChange={e=>setReason(e.target.value)}/><Button variant="outline" className="text-destructive" disabled={!reason.trim()||busy} onClick={async()=>{setBusy(true);try{await archive({data:{id:catalogId,reason}});await qc.invalidateQueries({queryKey:['catalog']});toast.success('Предмет архивирован');}catch(e){toast.error(e instanceof Error?e.message:'Ошибка');}finally{setBusy(false);}}}>Архивировать</Button></div>}<CatalogProposalEditor item={editing} catalogId={catalogId} onClose={()=>setEditing(null)}/></main>;
}
