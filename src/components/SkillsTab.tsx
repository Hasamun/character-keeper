import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ArrowDown, ArrowUp, ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { uid, PRIMARY_STAT_NAMES, SECONDARY_SKILLS, type Character } from '@/lib/rules';
import { EFFECT_KIND_LABELS, effectLabel, type EffectKind } from '@/lib/rules/items';
import { SkillEditor } from '@/components/SkillEditor';
import { SkillCatalog } from '@/components/SkillCatalog';
import { SkillTransferDialog } from '@/components/SkillTransferDialog';
import { submitSkill } from '@/lib/skill-catalog.functions';
import { commitDefinition, costAt, exhaustionBand, levelInRank, needsExhaustionConfirm, newSkillDefinition, rankOf, resolveLevel, SKILL_MAX_LEVEL, xpToNext, type SkillAction, type SkillInstance, type SkillType } from '@/lib/rules/skills';
import { skillAction } from '@/lib/skills.functions';
import { useCharacters } from '@/lib/characters-store';

type Run = (a: SkillAction) => Promise<boolean>;
function useSkillRunner(c: Character) {
  const store = useCharacters(); const call = useServerFn(skillAction); const [busy, setBusy] = useState(false);
  const run: Run = async a => {
    if (busy) return false; setBusy(true);
    try {
      await store.flush();
      const version = store.version(c.id); if (!version) throw new Error('Персонаж ещё не сохранён');
      const r = await call({ data: { id: c.id, opId: crypto.randomUUID(), version, action: a } });
      if (r.character) store.accept(r.character, r.version); return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Не удалось выполнить действие'; toast.error(m);
      if (m.includes('изменился')) await store.refresh().catch(() => undefined);
      return false;
    } finally { setBusy(false); }
  };
  return { run, busy };
}

export function ExhaustionPanel({ c, compact }: { c: Character; compact?: boolean }) {
  const { run, busy } = useSkillRunner(c);
  const [mode, setMode] = useState<null | 'manual' | 'rest' | 'potion'>(null);
  const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
  const v = c.exhaustion ?? 0, band = exhaustionBand(v);
  const submit = async () => {
    const n = Math.trunc(Number(amount)); if (!Number.isFinite(n) || !n) { toast.error('Введите целое число'); return; }
    const delta = mode === 'rest' ? -Math.abs(n) : n;
    if (await run({ type: 'exhaustion', delta, reason: reason.trim(), kind: mode! })) { setMode(null); setAmount(''); setReason(''); }
  };
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <span>Истощение: <b className={cn(v >= 500 && 'text-destructive')}>{v}</b> <span className="text-muted-foreground">(диапазон {band.label})</span></span>
    {!compact && <><Button size="sm" variant="outline" disabled={busy} onClick={() => setMode('manual')}>Изменить</Button><Button size="sm" variant="outline" disabled={busy || v === 0} onClick={() => setMode('rest')}>Отдых</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setMode('potion')}>Зелье / предмет</Button></>}
    <Dialog open={mode !== null} onOpenChange={o => !o && setMode(null)}>
      <DialogContent><DialogHeader><DialogTitle>{mode === 'rest' ? 'Отдых' : mode === 'potion' ? 'Воздействие зелья или предмета' : 'Изменить истощение'}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{mode === 'rest' ? 'Сколько единиц снять (решает ведущий).' : 'Положительное число добавляет истощение, отрицательное снимает.'}</p>
        <Input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Количество" />
        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Причина (необязательно)" maxLength={500} />
        <DialogFooter><Button variant="outline" onClick={() => setMode(null)}>Отмена</Button><Button disabled={busy} onClick={submit}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

export function SkillsSummary({ c }: { c: Character }) {
  const skills = c.skills ?? [];
  const active = (c.activeEffects ?? []).filter(a => a.sourceType === 'skill');
  if (!skills.length && !(c.exhaustion ?? 0)) return null;
  return <section className="wrap-safe mb-5 grid gap-2 border-b border-border pb-5">
    <h2 className="text-lg">Навыки</h2>
    <ExhaustionPanel c={c} compact />
    <p className="text-sm text-muted-foreground">Навыков: {skills.length} · действующих эффектов навыков: {active.length}</p>
    {active.map(a => <p key={a.id} className="text-sm">{a.sourceName}: {effectLabel(a.effect)}</p>)}
  </section>;
}

function SkillCard({ c, s, run, busy, onMove, onCopy, onDelete, canMove, onEdit, onRestore }: { c: Character; s: SkillInstance; run: Run; busy: boolean; onMove: (d: -1 | 1) => void; onCopy: () => void; onDelete: () => void; canMove: boolean; onEdit: () => void; onRestore: (i: number) => void }) {
  const [open, setOpen] = useState(false); const [confirm, setConfirm] = useState(false); const [viewLevel, setViewLevel] = useState(s.level);
  const [transfer, setTransfer] = useState(false); const send = useServerFn(submitSkill); const [sending, setSending] = useState(false);
  const [xp, setXp] = useState(''); const [reason, setReason] = useState(''); const [del, setDel] = useState(false); const [fullDesc, setFullDesc] = useState(false);
  const d = s.definition, need = xpToNext(d.type, s.level), cost = costAt(d, s.level), effects = resolveLevel(d, s.level);
  const ex = c.exhaustion ?? 0;
  const applyNow = () => run({ type: 'apply', skillId: s.id }).then(ok => ok && toast.success(`«${d.name}» применён`));
  const lu = s.lastUse, canUndo = !!lu && lu.after.level === s.level && lu.after.xp === s.xp && ex >= lu.cost;
  return <div className="wrap-safe panel p-3">
    <div className="flex flex-wrap items-start gap-2">
      <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 transition', open && 'rotate-180')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2"><b className="break-words">{d.name}</b>{s.draft && <span className="rounded border border-border px-1 text-xs text-muted-foreground">черновик</span>}<span className="text-xs text-muted-foreground">{d.type === 'active' ? 'Активный' : 'Пассивный'} · {rankOf(s.level)} {levelInRank(s.level)} (ур. {s.level}){d.type === 'active' && ` · истощение ${cost}`}</span></div>
          <div className="mt-1 flex items-center gap-2"><Progress value={need ? (s.xp / need) * 100 : 100} className="h-1.5" /><span className="shrink-0 text-xs text-muted-foreground">{need ? `${s.xp}/${need} XP` : 'Максимум'}</span></div>
          {effects.length > 0 && <p className="mt-1 truncate text-xs text-muted-foreground">{effects.map(effectLabel).join(' · ')}</p>}
        </div>
      </button>
      {d.type === 'active' && <Button size="sm" disabled={busy} onClick={() => needsExhaustionConfirm(ex, cost) ? setConfirm(true) : void applyNow()}>Применить</Button>}
    </div>
    {!open && d.description && <div className="mt-1 pl-6 text-xs text-muted-foreground"><p className={cn('whitespace-pre-wrap', !fullDesc && 'line-clamp-3')}>{d.description}</p>{d.description.length > 140 && <button className="text-primary underline" onClick={() => setFullDesc(v => !v)}>{fullDesc ? 'Свернуть' : 'Показать полностью'}</button>}</div>}
    {open && <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm">
      {d.description && <p className="whitespace-pre-wrap">{d.description}</p>}
      <div><div className="mb-1 font-semibold">Уровни</div>
        <div className="flex flex-wrap gap-1">{Array.from({ length: SKILL_MAX_LEVEL }, (_, i) => i + 1).map(l => <button key={l} onClick={() => setViewLevel(l)} className={cn('h-7 w-7 rounded border text-xs', l === viewLevel ? 'border-primary bg-primary/15 text-primary' : 'border-border', l === s.level && 'font-bold underline')}>{l}</button>)}</div>
        <div className="mt-2 rounded-md border border-border p-2"><div className="text-xs text-muted-foreground">Уровень {viewLevel} · {rankOf(viewLevel)} {levelInRank(viewLevel)}{d.type === 'active' && ` · истощение ${costAt(d, viewLevel)}`}{viewLevel < SKILL_MAX_LEVEL && ` · до следующего ${xpToNext(d.type, viewLevel)} XP`}</div>
          {resolveLevel(d, viewLevel).map(e => <div key={e.id}>{effectLabel(e)}{e.description ? ` — ${e.description}` : ''}</div>)}{resolveLevel(d, viewLevel).length === 0 && <div className="text-muted-foreground">Эффектов нет</div>}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]"><Input type="number" value={xp} onChange={e => setXp(e.target.value)} placeholder="± XP" /><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Причина" maxLength={500} />
        <Button variant="outline" disabled={busy} onClick={async () => { const n = Math.trunc(Number(xp)); if (!n) { toast.error('Введите целое число'); return; } if (await run({ type: 'xp', skillId: s.id, delta: n, reason: reason.trim() })) { setXp(''); setReason(''); } }}>Изменить XP</Button></div>
      <div className="flex flex-wrap gap-2">
        {d.type === 'active' && <Button size="sm" variant="outline" disabled={busy || !canUndo} onClick={() => void run({ type: 'undo', skillId: s.id })}>Отменить последнее применение</Button>}
        <Button size="sm" variant="outline" onClick={onEdit}>Редактировать</Button>
        <Button size="sm" variant="outline" onClick={onCopy}>Копировать</Button>
        <Button size="sm" variant="outline" onClick={() => setTransfer(true)}>Передать / обучить</Button>
        <Button size="sm" variant="outline" disabled={sending || !!s.draft} title={s.draft ? 'Черновик нельзя отправить' : undefined} onClick={async () => { if (!window.confirm(`Отправить «${d.name}» на модерацию в общий каталог? Уходят только описание и уровни, без вашего XP и истории.`)) return; setSending(true); try { await send({ data: { definition: d } }); toast.success('Отправлено на модерацию'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); } finally { setSending(false); } }}>В каталог</Button>
        {canMove && <><Button size="icon" variant="outline" aria-label="Выше" onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Ниже" onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button></>}
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDel(true)}>Удалить</Button>
      </div>
      {(s.versions?.length ?? 0) > 0 && <details><summary className="cursor-pointer text-primary">Версии ({s.versions!.length})</summary><ul className="mt-1 grid gap-1 text-xs">{s.versions!.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => <li key={i} className="flex flex-wrap items-center justify-between gap-2"><span className="text-muted-foreground">До правки {new Date(v.at).toLocaleString('ru-RU')}: «{v.definition.name}»</span><Button size="sm" variant="outline" onClick={() => onRestore(i)}>Восстановить</Button></li>)}</ul></details>}
      {s.history.length > 0 && <details><summary className="cursor-pointer text-primary">История ({s.history.length})</summary><ul className="mt-1 grid gap-1 text-xs text-muted-foreground">{[...s.history].reverse().map(h => <li key={h.id}>{new Date(h.at).toLocaleString('ru-RU')} — {h.text}</li>)}</ul></details>}
    </div>}
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Высокое истощение</AlertDialogTitle><AlertDialogDescription>Сейчас истощение {ex}, после применения будет {ex + cost}. Применить «{d.name}»?</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Нет</AlertDialogCancel><AlertDialogAction onClick={() => void applyNow()}>Да</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {transfer && <SkillTransferDialog c={c} s={s} open={transfer} onClose={() => setTransfer(false)} />}
    <AlertDialog open={del} onOpenChange={setDel}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить «{d.name}»?</AlertDialogTitle><AlertDialogDescription>Навык, его XP, история и действующие эффекты будут удалены.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={onDelete}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

export function SkillsTab({ c, save }: { c: Character; save: (c: Character) => Promise<void> }) {
  const [sub, setSub] = useState<'mine' | 'catalog'>('mine');
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<'all' | SkillType>('all'); const [sort, setSort] = useState<'own' | 'name' | 'level'>('own');
  const [editing, setEditing] = useState<string | null>(null);
  const editSkill = editing && editing !== 'new' ? (c.skills ?? []).find(x => x.id === editing) ?? null : null;
  const { run, busy } = useSkillRunner(c);
  const skills = c.skills ?? [];
  const shown = useMemo(() => {
    const l = skills.filter(s => (filter === 'all' || s.definition.type === filter) && s.definition.name.toLowerCase().includes(q.trim().toLowerCase()));
    if (sort === 'name') l.sort((a, b) => a.definition.name.localeCompare(b.definition.name, 'ru'));
    if (sort === 'level') l.sort((a, b) => b.level - a.level || b.xp - a.xp);
    return l;
  }, [skills, q, filter, sort]);
  const setSkills = (next: SkillInstance[], extra: Partial<Character> = {}) => save({ ...c, ...extra, skills: next }).catch(() => undefined);
  const move = (id: string, d: -1 | 1) => { const i = skills.findIndex(s => s.id === id), j = i + d; if (i < 0 || j < 0 || j >= skills.length) return; const n = [...skills]; [n[i], n[j]] = [n[j]!, n[i]!]; void setSkills(n); };
  const skillEffects = (c.activeEffects ?? []).filter(a => a.sourceType === 'skill');
  return <section className="wrap-safe grid gap-4">
    <div className="flex gap-2">{([['mine', 'Мои навыки'], ['catalog', 'Каталог']] as const).map(([k, l]) => <Button key={k} variant={sub === k ? 'default' : 'outline'} size="sm" onClick={() => setSub(k)}>{l}</Button>)}</div>
    {sub === 'catalog' ? <SkillCatalog c={c} /> : <>
      <div className="panel grid gap-3 p-3"><ExhaustionPanel c={c} />
        {skillEffects.length > 0 && <div className="text-sm"><div className="font-semibold">Действующие эффекты навыков</div>{skillEffects.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1"><span>{a.sourceName}: {effectLabel(a.effect)}</span><Button size="sm" variant="outline" onClick={() => void save({ ...c, activeEffects: (c.activeEffects ?? []).filter(x => x.id !== a.id) })}>Завершить</Button></div>)}</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-40 flex-1" value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по названию" />
        <select aria-label="Фильтр" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Все</option><option value="active">Активные</option><option value="passive">Пассивные</option></select>
        <select aria-label="Сортировка" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="own">Мой порядок</option><option value="name">По алфавиту</option><option value="level">По уровню</option></select>
        <Button onClick={() => setEditing('new')}><Plus className="mr-1 h-4 w-4" />Создать навык</Button>
      </div>
      {shown.length === 0 ? <p className="panel p-6 text-center text-sm text-muted-foreground">{skills.length ? 'Ничего не найдено' : 'У героя пока нет навыков'}</p>
        : shown.map(s => <SkillCard key={s.id} c={c} s={s} run={run} busy={busy} canMove={sort === 'own' && !q && filter === 'all'} onMove={d => move(s.id, d)} onEdit={() => setEditing(s.id)}
          onRestore={i => { const v = s.versions![i]!; if (confirm(`Восстановить версию от ${new Date(v.at).toLocaleString('ru-RU')}? Текущая сохранится в версиях.`)) void save(commitDefinition(c, s.id, v.definition, !!s.draft, 'Восстановлена прежняя версия')).catch(() => undefined); }}
          onCopy={() => void setSkills([...skills, { ...structuredClone(s), id: uid(), lastUse: undefined, level: 1, xp: 0, definition: { ...structuredClone(s.definition), name: `${s.definition.name} (копия)` }, history: [{ id: uid(), at: new Date().toISOString(), text: `Копия навыка «${s.definition.name}»` }] }])}
          onDelete={() => void setSkills(skills.filter(x => x.id !== s.id), { activeEffects: (c.activeEffects ?? []).filter(a => !(a.sourceType === 'skill' && a.sourceItemId === s.id)) })} />)}
    </>}
    <SkillEditor open={editing !== null} initial={editSkill?.definition ?? null} initialDraft={!!editSkill?.draft} onClose={() => setEditing(null)}
      onSave={(def, draft) => {
        const p = editSkill ? save(commitDefinition(c, editSkill.id, def, draft, draft ? 'Изменён в редакторе (черновик)' : 'Изменён в редакторе'))
          : setSkills([...skills, { id: uid(), definition: def, level: 1, xp: 0, draft, history: [{ id: uid(), at: new Date().toISOString(), text: 'Навык создан вручную' }] }]);
        void Promise.resolve(p).then(() => { setEditing(null); toast.success('Навык сохранён'); }).catch(() => undefined);
      }} />
  </section>;
}
