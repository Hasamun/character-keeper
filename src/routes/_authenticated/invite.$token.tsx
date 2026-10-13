import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invitationAction } from '@/lib/sharing.functions';
import { contentHead } from '@/lib/catalog-queries';
import { PermissionsFields } from '@/components/CharacterAccess';
import { normalizePermissions } from '@/lib/rules/sharing';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
export const Route=createFileRoute('/_authenticated/invite/$token')({head:()=>contentHead('Приглашение к персонажу','Принятие приглашения и просмотр предоставляемых прав.'),component:Page});
function Page(){const{token}=Route.useParams();const act=useServerFn(invitationAction),navigate=useNavigate(),qc=useQueryClient();const q=useQuery({queryKey:['invite',token],queryFn:()=>act({data:{token,action:'preview'}}),retry:false});const m=useMutation({mutationFn:act,onSuccess:(r,v)=>{qc.invalidateQueries({queryKey:['shared-characters']});if(v.data.action==='accept')navigate({to:'/shared/$id',params:{id:r.characterId}});else navigate({to:'/'})},onError:e=>toast.error(e.message)});return <main className="mx-auto grid max-w-lg gap-4 p-6"><Link to="/" className="text-primary">← Все герои</Link><h1 className="text-2xl text-gold">Приглашение к персонажу</h1>{q.isPending&&<p>Проверяем приглашение…</p>}{q.error&&<p className="text-destructive">{q.error.message}</p>}{q.data&&<><p>Владелец: {q.data.ownerName}</p><PermissionsFields value={normalizePermissions(q.data.permissions)}/><p className="text-sm text-muted-foreground">До {new Date(q.data.expiresAt).toLocaleString('ru-RU')}</p><div className="flex gap-2"><Button disabled={m.isPending} onClick={()=>m.mutate({data:{token,action:'accept'}})}>Принять</Button><Button variant="outline" disabled={m.isPending} onClick={()=>m.mutate({data:{token,action:'decline'}})}>Отклонить</Button></div></>}</main>}