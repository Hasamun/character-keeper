import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { uid, PRIMARY_STAT_NAMES, SECONDARY_SKILLS } from '@/lib/rules';
import { EFFECT_KIND_LABELS, LIFECYCLE_LABELS, effectLabel, type Effect, type EffectKind, type Automation, type EffectLifecycle } from '@/lib/rules/items';
import { useServerFn } from '@tanstack/react-start';
import { RankLevelPicker } from '@/components/SkillsTab';
import { generateSkill } from '@/lib/skill-ai.functions';
import { SkillProposalReview } from './SkillProposalReview';
import { aiDraftToDefinition, resolvedLevels, type AiSkillDraft } from '@/lib/rules/skills';
import { costAt, diffLevels, filledLevels, levelInRank, newSkillDefinition, rankOf, rankRange, resolveLevel, setLevelCost, setLevelEffects, SKILL_MAX_LEVEL, type SkillDefinition } from '@/lib/rules/skills';

const AUTO: Record<Automation, string> = { auto: 'Автоматически', confirm: 'С подтверждением', manual: 'Вручную (игровое решение)' };
const sel = 'h-9 rounded-md border border-border bg-background px-2 text-sm';

function EffectRow({ e, onChange, onRemove }: { e: Effect; onChange: (e: Effect) => void; onRemove: () => void }) {
  const needsTarget = e.kind === 'stat' || e.kind === 'skill';
  const set = (p: Partial<Effect>) => onChange({ ...e, ...p });
  return <div className="grid gap-2 rounded-md border border-border p-2">
    <div className="flex flex-wrap gap-2">
      <select aria-label="Тип эффекта" className={cn(sel, 'flex-1')} value={e.kind} onChange={x => set({ kind: x.target.value as EffectKind, target: '' })}>{Object.entries(EFFECT_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {needsTarget && <select aria-label="Цель" className={cn(sel, 'flex-1')} value={e.target} onChange={x => set({ target: x.target.value })}><option value="">Выберите…</option>{(e.kind === 'stat' ? PRIMARY_STAT_NAMES : SECONDARY_SKILLS).map(n => <option key={n} value={n}>{n}</option>)}</select>}
      <Input aria-label="Значение" className="w-24" type="number" value={e.value} onChange={x => set({ value: Math.trunc(Number(x.target.value)) || 0 })} />
      <Button size="icon" variant="outline" aria-label="Удалить эффект" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
    </div>
    <select aria-label="Тип действия" className={cn(sel, !e.lifecycle && 'border-destructive')} value={e.lifecycle ?? ''} onChange={x => set({ lifecycle: (x.target.value || undefined) as EffectLifecycle | undefined })}><option value="">Уточните тип действия…</option>{Object.entries(LIFECYCLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    <Input placeholder="Описание эффекта" maxLength={500} value={e.description ?? ''} onChange={x => set({ description: x.target.value || undefined })} />
    <details><summary className="cursor-pointer text-xs text-primary">Дополнительные параметры</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select aria-label="Применение" className={sel} value={e.automation} onChange={x => set({ automation: x.target.value as Automation })}>{Object.entries(AUTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {['resistance', 'vulnerability', 'extra_damage', 'damage'].includes(e.kind) && <Input placeholder="Тип урона" value={e.damageType ?? ''} onChange={x => set({ damageType: x.target.value || undefined })} />}
        <Input placeholder="Условие (необязательно)" value={e.condition ?? ''} onChange={x => set({ condition: x.target.value || undefined })} />
        <Input placeholder="Длительность (текстом)" value={e.duration ?? ''} onChange={x => set({ duration: x.target.value || undefined })} />
      </div>
    </details>
  </div>;
}

function AiPanel({ def, onAccept }: { def: SkillDefinition; onAccept: (d: SkillDefinition) => void }) {
  const gen = useServerFn(generateSkill);
  const [prompt, setPrompt] = useState(''); const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<SkillDefinition | null>(null); const [examples, setExamples] = useState(0);
  const isEmpty = def.levels.every(l => l.origin === 'empty') && !def.name.trim();
  const run = async () => {
    if (prompt.trim().length < 3) { toast.error('Опишите навык подробнее'); return; }
    setBusy(true);
    try {
      const current = isEmpty ? null : { name: def.name, type: def.type, description: def.description, levels: resolvedLevels(def).map((l, i) => ({ level: i + 1, exhaustionCost: def.type === 'active' ? l.cost : null, effects: l.effects.map(e => ({ ...e, key: e.id })) })) };
      const r = await gen({ data: { prompt: prompt.trim(), type: isEmpty ? null : def.type, current } });
      const p = aiDraftToDefinition(r.draft as AiSkillDraft, uid, resolvedLevels(def).flatMap(l => l.effects.map(e => e.id)));
      setProposal(p); setExamples(r.examples ?? 0);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка ИИ'); } finally { setBusy(false); }
  };
  return <details className="panel p-3" open={!!proposal}>
    <summary className="cursor-pointer font-semibold text-primary">{isEmpty ? 'Создать с помощью ИИ' : 'Доработать с помощью ИИ'}</summary>
    {!proposal ? <div className="mt-2 grid gap-2">
      <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} placeholder={isEmpty ? 'Например: активный навык щитоносца — парирование, рост КБ и способность прикрыть союзника' : 'Что изменить: например, ослабить бонусы на 1–10 уровнях'} />
      <Button size="sm" disabled={busy} onClick={() => void run()}>{busy ? 'ИИ думает… (до минуты)' : isEmpty ? 'Сгенерировать' : 'Предложить изменения'}</Button>
      <p className="text-xs text-muted-foreground">Ничего не сохраняется само: вы увидите отличия и выберете, что принять.</p>
    </div> : <div className="mt-2"><SkillProposalReview def={def} proposal={proposal} onAccept={d => { onAccept(d); setProposal(null); toast.success('Принято в редактор — проверьте и сохраните'); }} onReject={() => setProposal(null)} note={examples ? `ИИ учёл похожие навыки каталога: ${examples}` : 'Похожих навыков в каталоге нет — баланс по общим правилам.'} /></div>}
  </details>;
}

type Step = 'create' | 'develop' | 'review';
export function SkillEditor({ open, initial, initialDraft, onClose, onSave, compare }: { open: boolean; initial: SkillDefinition | null; initialDraft: boolean; onClose: () => void; onSave: (def: SkillDefinition, draft: boolean, tookCompare: boolean) => void; compare?: { proposal: SkillDefinition; label: string } | null }) {
  const [cmpOpen, setCmpOpen] = useState(false); const [tookCompare, setTookCompare] = useState(false);
  const base = useMemo(() => initial ?? { ...newSkillDefinition('active'), name: '' }, [initial, open]);
  const [def, setDef] = useState(base); const [level, setLevel] = useState(1);
  const [scope, setScope] = useState<'level' | 'rank' | 'all'>('level'); const [list, setList] = useState<Effect[]>([]);
  const [cost, setCost] = useState(''); const [draft, setDraft] = useState(initialDraft);
  const [step, setStep] = useState<Step>('create'); const [mode, setMode] = useState<null | 'manual' | 'ai'>(null);
  useEffect(() => { if (open) { setDef(base); setLevel(1); setDraft(initialDraft); setStep(initial ? 'develop' : 'create'); setMode(initial ? 'manual' : null); setCmpOpen(!!compare); setTookCompare(false); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { setList(structuredClone(resolveLevel(def, level))); const c = def.levels[level - 1]?.exhaustionCost; setCost(c == null ? '' : String(c)); }, [def, level]);
  const [from, to] = scope === 'level' ? [level, level] : scope === 'rank' ? rankRange(level) : [1, SKILL_MAX_LEVEL];
  const dirtyLevel = JSON.stringify(list) !== JSON.stringify(resolveLevel(def, level)) || cost !== String(def.levels[level - 1]?.exhaustionCost ?? '');
  const apply = () => {
    if (list.some(e => (e.kind === 'stat' || e.kind === 'skill') && !e.target)) { toast.error('У эффекта не выбрана цель'); return false; }
    let next = setLevelEffects(def, from, to, list);
    if (def.type === 'active') {
      const n = cost.trim() === '' ? undefined : Math.trunc(Number(cost));
      if (n != null && (!Number.isFinite(n) || n < 0)) { toast.error('Стоимость — целое число от 0'); return false; }
      next = setLevelCost(next, from, to, n);
    }
    setDef(next); return true;
  };
  const diffs = useMemo(() => diffLevels(base, def), [base, def]);
  const filled = filledLevels(def);
  const go = (s: Step) => {
    if (s !== 'create' && !def.name.trim()) { if (mode === 'ai') { toast.info('Сначала сгенерируйте навык и нажмите «Принять»'); return; } toast.error('Введите название'); setStep('create'); setMode(m => m ?? 'manual'); return; }
    if (step === 'develop' && dirtyLevel && !apply()) return;
    setStep(s);
  };
  const pickLevel = (l: number) => { if (dirtyLevel && !confirm('Есть неприменённые правки уровня. Отбросить их?')) return; setLevel(l); };
  const meta = base.name !== def.name || base.description !== def.description || base.type !== def.type;
  return <Dialog open={open} onOpenChange={o => !o && onClose()}>
    <DialogContent className="wrap-safe max-h-[92dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle className="break-words">{initial ? `Редактор: ${initial.name}` : 'Новый навык'}</DialogTitle></DialogHeader>
      <div className="flex flex-wrap gap-1">{([['create', '1. Создание'], ['develop', '2. Развитие'], ['review', '3. Проверка']] as const).map(([k, l]) => <Button key={k} size="sm" variant={step === k ? 'default' : 'outline'} onClick={() => go(k)}>{l}</Button>)}</div>
      {step === 'create' && <div className="grid gap-3 text-sm">
        {!initial && <div className="grid gap-2 sm:grid-cols-2">
          <Button variant={mode === 'manual' ? 'default' : 'outline'} className="h-auto whitespace-normal py-3" onClick={() => setMode('manual')}>Создать вручную</Button>
          <Button variant={mode === 'ai' ? 'default' : 'outline'} className="h-auto whitespace-normal py-3" onClick={() => setMode('ai')}>Создать с помощью ИИ</Button></div>}
        {mode === 'ai' && <AiPanel def={def} onAccept={d => { setDef(d); setMode('manual'); setStep('develop'); }} />}
        {mode === 'manual' && <>
          <Input value={def.name} onChange={e => setDef({ ...def, name: e.target.value })} placeholder="Название" maxLength={120} />
          <div className="flex gap-2">{(['active', 'passive'] as const).map(t => <Button key={t} size="sm" variant={def.type === t ? 'default' : 'outline'} onClick={() => setDef({ ...def, type: t })}>{t === 'active' ? 'Активный' : 'Пассивный'}</Button>)}</div>
          <Textarea value={def.description} onChange={e => setDef({ ...def, description: e.target.value })} placeholder="Описание" maxLength={4000} />
          {initial && <AiPanel def={def} onAccept={setDef} />}
          <p className="text-xs text-muted-foreground">Начальные эффекты задаются на следующем шаге для уровня 1 — остальные уровни их унаследуют.</p>
        </>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Отмена</Button>{mode && (mode === 'manual' || def.name.trim()) && <Button onClick={() => { go('develop'); setLevel(1); }}>Далее: развитие</Button>}</DialogFooter>
      </div>}
      {compare && cmpOpen && <div className="panel grid gap-2 p-3"><b className="break-words">{compare.label}</b>
        <SkillProposalReview def={def} proposal={compare.proposal} origin="manual" defaultAll={false} note="Отметьте изменения шаблона, которые хотите перенести. Уровень и XP героя не меняются." onAccept={d => { setDef(d); setTookCompare(true); setCmpOpen(false); setStep('review'); }} onReject={() => setCmpOpen(false)} /></div>}
      {step === 'develop' && <div className="grid gap-3 text-sm">
        <div><div className="mb-1 font-semibold">Ранг и уровень</div><RankLevelPicker level={level} onPick={pickLevel} marked={filled} />
          <p className="mt-1 text-xs text-muted-foreground">Жирные — уровни со своими изменениями; остальные наследуют предыдущий.</p></div>
        <div className="panel grid gap-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>Уровень {level} · {rankOf(level)} {levelInRank(level)}</b>
            {level > 1 && <Button size="sm" variant="outline" onClick={() => setList(structuredClone(resolveLevel(def, level - 1)))}><Copy className="mr-1 h-4 w-4" />Как на {level - 1}-м</Button>}</div>
          {def.type === 'active' && <label className="grid gap-1">Стоимость истощения (пусто — наследовать, сейчас {costAt(def, level)})<Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></label>}
          {list.map((e, i) => <EffectRow key={e.id} e={e} onChange={n => setList(list.map((x, j) => (j === i ? n : x)))} onRemove={() => setList(list.filter((_, j) => j !== i))} />)}
          {list.length === 0 && <p className="text-muted-foreground">Эффектов нет</p>}
          <Button size="sm" variant="outline" onClick={() => setList([...list, { id: uid(), kind: 'ability', target: '', value: 0, automation: 'manual' }])}><Plus className="mr-1 h-4 w-4" />Добавить эффект</Button>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <select aria-label="Область" className={sel} value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
              <option value="level">Только этот уровень</option><option value="rank">Весь ранг (ур. {rankRange(level)[0]}–{rankRange(level)[1]})</option><option value="all">Все 25 уровней</option></select>
            <Button size="sm" disabled={!dirtyLevel && scope === 'level'} onClick={() => { if (scope !== 'level' && !confirm(`Уровни ${from}–${to} получат этот набор, их собственные изменения будут сброшены. Продолжить?`)) return; if (apply()) toast.success('Применено к черновику редактора'); }}>Применить</Button>
            <span className="text-xs text-muted-foreground">Уровни выше {to} сохраняют свои изменения.</span>
          </div>
        </div>
        <AiPanel def={def} onAccept={setDef} />
        <DialogFooter><Button variant="outline" onClick={() => go('create')}>Назад</Button><Button onClick={() => go('review')}>Далее: проверка</Button></DialogFooter>
      </div>}
      {step === 'review' && <div className="grid gap-3 text-sm">
        <div className="font-semibold">Было → Стало</div>
        {meta && <div className="rounded-md border border-border p-2">{base.name !== def.name && <div className="break-words">Название: «{base.name || '—'}» → «{def.name}»</div>}{base.type !== def.type && <div>Тип: {base.type === 'active' ? 'активный' : 'пассивный'} → {def.type === 'active' ? 'активный' : 'пассивный'}</div>}{base.description !== def.description && <div>Описание изменено</div>}</div>}
        {diffs.length === 0 ? <p className="text-muted-foreground">Изменений по уровням нет.</p>
          : <div className="grid gap-2">{diffs.map(d => <div key={d.level} className="rounded-md border border-border p-2"><div className="text-xs text-muted-foreground">Уровень {d.level} · {rankOf(d.level)} {levelInRank(d.level)}</div>
            {d.added.map(e => <div key={'a' + e.id} className="text-primary">+ {effectLabel(e)}</div>)}
            {d.removed.map(e => <div key={'r' + e.id} className="text-destructive">− {effectLabel(e)}</div>)}
            {d.changed.map(x => <div key={'c' + x.after.id}>{effectLabel(x.before)} → {effectLabel(x.after)}</div>)}
            {d.costBefore !== d.costAfter && <div>Истощение: {d.costBefore} → {d.costAfter}</div>}</div>)}</div>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft} onChange={e => setDraft(e.target.checked)} />Сохранить как черновик (можно неполный)</label>
        <DialogFooter><Button variant="outline" onClick={() => { if (confirm('Отклонить все изменения и закрыть редактор?')) onClose(); }}>Отклонить</Button><Button variant="outline" onClick={() => setStep('develop')}>Назад</Button><Button onClick={() => onSave({ ...def, name: def.name.trim(), description: def.description.trim() }, draft, tookCompare)}>Принять и сохранить</Button></DialogFooter>
      </div>}
    </DialogContent>
  </Dialog>;
}
