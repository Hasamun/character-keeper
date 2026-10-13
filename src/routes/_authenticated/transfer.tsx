import {createFileRoute} from '@tanstack/react-router';
import {TransferPage} from '@/components/TransferPage';
export const Route=createFileRoute('/_authenticated/transfer')({
 validateSearch:(s:Record<string,unknown>)=>({character:typeof s.character==='string'?s.character:undefined}),
 head:()=>({meta:[{title:'Перенос и резервные копии — Летопись героев'},{name:'description',content:'Импорт персонажей и предметов, экспорт карточек и резервные копии с изображениями.'},{property:'og:title',content:'Перенос и копии — Летопись героев'},{property:'og:description',content:'Перенос игровых данных и ручные резервные копии персонажей.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 component:()=> <TransferPage initialId={Route.useSearch().character}/>,
});
