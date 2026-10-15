import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { acceptSkillOffer, decideSkillOffer, listSkillOffers } from '@/lib/skills.functions';
import { useCharacters } from '@/lib/characters-store';

/** Pending skill offers: incoming ones need an explicit choice of hero; outgoing ones can be cancelled. */
export function SkillOffers() {
  const list = useServerFn(listSkillOffers), accept = useServerFn(acceptSkillOffer), decide = useServerFn(decideSkillOffer), qc = useQueryClient();
  const store = useCharacters(); const [pick, setPick] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ['skill-offers'], queryFn: () => list(), refetchInterval: 15000 });
  const done = () => { void qc.invalidateQueries({ queryKey: ['skill-offers'] }); void store.refresh().catch(() => undefined); };
  const acc = useMutation({ mutationFn: accept, onSuccess: r => { toast.success(`Навык «${r.name}» изучен`); done(); }, onError: e => toast.error(e.message) });
  const dec = useMutation({ mutationFn: decide, onSuccess: done, onError: e => toast.error(e.message) });
  const items = q.data ?? []; if (!items.length) return null;
  const busy = acc.isPending || dec.isPending;
  return <div className="wrap-safe grid gap-3">
    <h3 className="text-lg">Предложения навыков</h3>
    {items.map(o => <article key={o.id} className="grid min-w-0 gap-2 rounded-lg border border-border p-4 text-sm">
      {o.incoming
        ? <><p className="break-words"><b>{o.fromName || 'Игрок'}</b> предлагает обучить навыку <b>«{o.skillName}»</b> (герой «{o.heroName}») — {o.mode === 'teach_current' ? `уровень ${o.level}` : 'с 1 уровня'}, XP 0.</p>
          <div className="flex flex-wrap gap-2"><select aria-label="Кому" className="h-9 min-w-0 max-w-full rounded-md border border-border bg-background px-2" value={pick[o.id] ?? ''} onChange={e => setPick({ ...pick, [o.id]: e.target.value })}><option value="">Выберите героя…</option>{store.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <Button size="sm" disabled={busy || !pick[o.id]} onClick={() => { void store.flush().then(() => acc.mutate({ data: { offerId: o.id, toId: pick[o.id]! } })); }}>Принять</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => window.confirm('Отказаться от навыка?') && dec.mutate({ data: { offerId: o.id, action: 'decline' } })}>Отклонить</Button></div></>
        : <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words">Вы предложили «{o.skillName}» от героя «{o.heroName}». Ждём подтверждения игрока.</p><Button size="sm" variant="outline" disabled={busy} onClick={() => dec.mutate({ data: { offerId: o.id, action: 'cancel' } })}>Отозвать</Button></div>}
    </article>)}
  </div>;
}
