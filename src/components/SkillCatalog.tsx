import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Character } from '@/lib/rules';
import { effectLabel } from '@/lib/rules/items';
import { costAt, levelInRank, normalizeSkillDefinition, rankOf, resolveLevel, SKILL_MAX_LEVEL } from '@/lib/rules/skills';
import { accountInfo } from '@/lib/catalog.functions';
import { addCatalogSkill, archiveSkill, listSkillCatalog, listSkillSubmissions, reviewSkill } from '@/lib/skill-catalog.functions';
import { useCharacters } from '@/lib/characters-store';

const STATUS: Record<string, string> = { pending: 'На модерации', approved: 'Одобрено', rejected: 'Отклонено' };

function SkillPreview({ raw }: { raw: unknown }) {
  const d = normalizeSkillDefinition(raw); const [lv, setLv] = useState(1);
  return <div className="grid gap-2 text-sm">
    {d.description && <p className="whitespace-pre-wrap">{d.description}</p>}
    <div className="flex flex-wrap gap-1">{Array.from({ length: SKILL_MAX_LEVEL }, (_, i) => i + 1).map(l => <button key={l} onClick={() => setLv(l)} className={cn('h-7 w-7 rounded border text-xs', l === lv ? 'border-primary bg-primary/15 text-primary' : 'border-border')}>{l}</button>)}</div>
    <div className="rounded-md border border-border p-2"><div className="text-xs text-muted-foreground">Уровень {lv} · {rankOf(lv)} {levelInRank(lv)}{d.type === 'active' && ` · истощение ${costAt(d, lv)}`}</div>
      {resolveLevel(d, lv).map(e => <div key={e.id}>{effectLabel(e)}{e.description ? ` — ${e.description}` : ''}</div>)}{resolveLevel(d, lv).length === 0 && <div className="text-muted-foreground">Эффектов нет</div>}</div>
  </div>;
}

function Moderation() {
  const list = useServerFn(listSkillSubmissions), review = useServerFn(reviewSkill); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['skill-subs', 'admin'], queryFn: () => list({ data: { admin: true, page: 1 } }) });
  const [reason, setReason] = useState<Record<string, string>>({}); const [open, setOpen] = useState<string | null>(null);
  const decide = async (id: string, revision: number, approve: boolean) => {
    try { await review({ data: { id, revision, approve, reason: reason[id] ?? '' } }); toast.success(approve ? 'Навык опубликован' : 'Предложение отклонено'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    void qc.invalidateQueries({ queryKey: ['skill-subs'] }); void qc.invalidateQueries({ queryKey: ['skill-catalog'] });
  };
  if (!q.data?.rows.length) return null;
  return <div className="panel grid gap-2 p-3"><b>Модерация навыков ({q.data.count})</b>
    {q.data.rows.map(r => { const d = normalizeSkillDefinition(r.data); return <div key={r.id} className="rounded-md border border-border p-2 text-sm">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}><ChevronDown className={cn('h-4 w-4', open === r.id && 'rotate-180')} /><b>{d.name}</b><span className="text-xs text-muted-foreground">{d.type === 'active' ? 'Активный' : 'Пассивный'}{r.catalog_id ? ' · правка опубликованного' : ''}</span></button>
      {open === r.id && <div className="mt-2"><SkillPreview raw={r.data} /></div>}
      <div className="mt-2 flex flex-wrap gap-2"><Input className="min-w-40 flex-1" placeholder="Причина (обязательна при отклонении)" value={reason[r.id] ?? ''} onChange={e => setReason({ ...reason, [r.id]: e.target.value })} />
        <Button size="sm" onClick={() => void decide(r.id, r.revision, true)}>Одобрить</Button><Button size="sm" variant="outline" onClick={() => void decide(r.id, r.revision, false)}>Отклонить</Button></div>
    </div>; })}
  </div>;
}

export function SkillCatalog({ c }: { c: Character }) {
  const list = useServerFn(listSkillCatalog), add = useServerFn(addCatalogSkill), archive = useServerFn(archiveSkill), info = useServerFn(accountInfo), subs = useServerFn(listSkillSubmissions);
  const store = useCharacters(); const qc = useQueryClient();
  const [q, setQ] = useState(''); const [type, setType] = useState<'all' | 'active' | 'passive'>('all'); const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [open, setOpen] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const me = useQuery({ queryKey: ['account-info'], queryFn: () => info() });
  const mine = useQuery({ queryKey: ['skill-subs', 'mine'], queryFn: () => subs({ data: { admin: false, page: 1 } }) });
  const cat = useInfiniteQuery({
    queryKey: ['skill-catalog', q.trim(), type, sort], initialPageParam: 1,
    queryFn: ({ pageParam }) => list({ data: { q: q.trim(), type, sort, page: pageParam } }),
    getNextPageParam: (last, all) => (all.length * last.pageSize < last.count ? all.length + 1 : undefined),
  });
  const rows = cat.data?.pages.flatMap(p => p.rows) ?? [];
  const total = cat.data?.pages[0]?.count ?? 0;
  const addToHero = async (id: string, name: string) => {
    if ((c.skills ?? []).some(s => s.definition.name === name) && !confirm(`У героя уже есть навык «${name}». Добавить ещё одну независимую копию?`)) return;
    setBusy(true);
    try { await store.flush(); const r = await add({ data: { catalogId: id, characterId: c.id } }); store.accept(r.character, r.version); toast.success(`«${name}» добавлен герою (уровень 1)`); }
    catch (e) { const m = e instanceof Error ? e.message : 'Ошибка'; toast.error(m); if (m.includes('изменился')) await store.refresh().catch(() => undefined); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-3">
    {me.data?.admin && <Moderation />}
    <div className="flex flex-wrap gap-2">
      <Input className="min-w-40 flex-1" value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск в каталоге" />
      <select aria-label="Тип" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={type} onChange={e => setType(e.target.value as typeof type)}><option value="all">Все</option><option value="active">Активные</option><option value="passive">Пассивные</option></select>
      <select aria-label="Сортировка каталога" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="recent">Сначала новые</option><option value="name">По алфавиту</option></select>
    </div>
    {cat.isError && <p className="panel p-4 text-sm text-destructive">{cat.error instanceof Error ? cat.error.message : 'Каталог недоступен'}</p>}
    {cat.isLoading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : rows.length === 0 ? <p className="panel p-6 text-center text-sm text-muted-foreground">{q || type !== 'all' ? 'Ничего не найдено' : 'В каталоге пока нет навыков. Предложите свой: кнопка «В каталог» в карточке навыка.'}</p>
      : <><p className="text-xs text-muted-foreground">Найдено: {total}</p>{rows.map(r => <div key={r.id} className="panel p-3">
        <div className="flex items-start gap-2">
          <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}><ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 transition', open === r.id && 'rotate-180')} />
            <div className="min-w-0"><b className="break-words">{r.name}</b> <span className="text-xs text-muted-foreground">{r.type === 'active' ? 'Активный' : 'Пассивный'} · версия {r.version}{r.mine ? ' · ваш' : ''}</span></div></button>
          <Button size="sm" disabled={busy} onClick={() => void addToHero(r.id, r.name)}>Добавить герою</Button>
        </div>
        {open === r.id && <div className="mt-3 border-t border-border pt-3"><SkillPreview raw={r.data} />
          {me.data?.admin && <Button className="mt-2 text-destructive" size="sm" variant="outline" onClick={async () => { const reason = prompt('Причина снятия с каталога'); if (reason === null) return; try { await archive({ data: { id: r.id, reason } }); toast.success('Навык убран из каталога'); void qc.invalidateQueries({ queryKey: ['skill-catalog'] }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); } }}>Убрать из каталога</Button>}</div>}
      </div>)}
      {cat.hasNextPage && <Button variant="outline" disabled={cat.isFetchingNextPage} onClick={() => void cat.fetchNextPage()}>{cat.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}</Button>}</>}
    {(mine.data?.rows.length ?? 0) > 0 && <details className="panel p-3 text-sm"><summary className="cursor-pointer font-semibold text-primary">Мои предложения ({mine.data!.count})</summary>
      <ul className="mt-2 grid gap-1">{mine.data!.rows.map(r => <li key={r.id} className="flex flex-wrap justify-between gap-2"><span>{normalizeSkillDefinition(r.data).name}</span><span className={cn('text-xs', r.status === 'rejected' ? 'text-destructive' : 'text-muted-foreground')}>{STATUS[r.status] ?? r.status}{r.reason ? ` — ${r.reason}` : ''}</span></li>)}</ul></details>}
  </div>;
}
