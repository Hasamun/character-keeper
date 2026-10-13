import { createFileRoute, Link } from '@tanstack/react-router';
import { CharacterAccess } from '@/components/CharacterAccess';
import { contentHead } from '@/lib/catalog-queries';
export const Route=createFileRoute('/_authenticated/character/$id/access')({head:()=>contentHead('Доступ к персонажу','Участники, права по разделам и приглашения к персонажу.'),component:Page});
function Page(){const{id}=Route.useParams();return <main className="mx-auto max-w-2xl p-4"><Link to="/character/$id" params={{id}} className="mb-5 block text-primary">← К персонажу</Link><CharacterAccess id={id}/></main>}