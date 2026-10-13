import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ItemEditor } from './ItemEditor';
import type { Item } from '@/lib/rules/inventory';
import { submitCatalog } from '@/lib/catalog.functions';
export function CatalogProposalEditor({item,onClose,submissionId,catalogId}:{item:Item|null;onClose:()=>void;submissionId?:string;catalogId?:string}){
 const send=useServerFn(submitCatalog);const qc=useQueryClient();const [busy,setBusy]=useState(false);
 return <><ItemEditor item={item} onClose={()=>!busy&&onClose()} onSave={async i=>{if(busy)return;setBusy(true);try{await send({data:{item:i,...(submissionId?{submissionId}:{}),...(catalogId?{catalogId}:{})}});await qc.invalidateQueries({queryKey:['submissions']});toast.success('Предложение отправлено на проверку');onClose();}catch(e){toast.error(e instanceof Error?e.message:'Не удалось отправить');}finally{setBusy(false);}}}/>{busy&&<div role="status" className="fixed bottom-4 left-4 z-50 rounded-md border border-border bg-background p-3 text-sm">Отправляем предложение…</div>}</>;
}
