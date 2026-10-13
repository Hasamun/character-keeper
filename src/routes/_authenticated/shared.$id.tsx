import { createFileRoute } from '@tanstack/react-router';
import { SharedCharacter } from '@/components/SharedCharacter';
import { contentHead } from '@/lib/catalog-queries';
export const Route=createFileRoute('/_authenticated/shared/$id')({head:()=>contentHead('Общий персонаж','Разрешённые сведения, характеристики, предметы и заметки общего персонажа.'),component:Page});
function Page(){const{id}=Route.useParams();return <SharedCharacter id={id}/>}