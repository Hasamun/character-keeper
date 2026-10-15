import { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { effectLabel } from '@/lib/rules/items';
import { diffLevels, levelInRank, mergeSelection, rankOf, SKILL_RANKS, type LevelPick, type SkillDefinition } from '@/lib/rules/skills';

/** Selective review of a proposal (AI or catalog): whole proposal, a rank, a level, or single effects. Nothing is accepted by default except what the user leaves checked. */
export function SkillProposalReview({ def, proposal, onAccept, onReject, note, origin = 'ai', defaultAll = true }: { def: SkillDefinition; proposal: SkillDefinition; onAccept: (d: SkillDefinition) => void; onReject: () => void; note?: string; origin?: 'ai' | 'manual'; defaultAll?: boolean }) {
  const diffs = useMemo(() => diffLevels(def, proposal), [def, proposal]);
  const [picks, setPicks] = useState<Record<number, LevelPick>>(() => defaultAll ? Object.fromEntries(diffs.map(d => [d.level, 'all' as const])) : {});
  const metaDiff = def.name !== proposal.name || def.description !== proposal.description || def.type !== proposal.type;
  const [takeMeta, setTakeMeta] = useState(defaultAll && metaDiff);
  const setLevels = (levels: number[], on: boolean) => { const n = { ...picks }; for (const l of levels) { if (on) n[l] = 'all'; else delete n[l]; } setPicks(n); };
  const ids = (d: (typeof diffs)[number]) => [...d.added.map(e => e.id), ...d.removed.map(e => e.id), ...d.changed.map(x => x.after.id)];
  const toggleEffect = (level: number, all: string[], id: string, on: boolean) => {
    const cur = picks[level], list = cur === 'all' ? all : cur ?? [];
    const next = on ? [...new Set([...list, id])] : list.filter(x => x !== id);
    const n = { ...picks }; if (!next.length) delete n[level]; else n[level] = next; setPicks(n);
  };
  const has = (level: number, id: string) => { const p = picks[level]; return p === 'all' || (Array.isArray(p) && p.includes(id)); };
  const count = Object.keys(picks).length;
  return <div className="wrap-safe grid gap-2 text-sm">
    {note && <p className="text-xs text-muted-foreground">{note}</p>}
    {metaDiff && <label className="flex items-start gap-2"><input type="checkbox" checked={takeMeta} onChange={e => setTakeMeta(e.target.checked)} /><span className="min-w-0 break-words">Название, тип и описание: <b>{proposal.name}</b> ({proposal.type === 'active' ? 'активный' : 'пассивный'}) — {proposal.description}</span></label>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setLevels(diffs.map(d => d.level), true)}>Вся прогрессия</Button><Button size="sm" variant="outline" onClick={() => setPicks({})}>Снять все</Button>
      {SKILL_RANKS.map((r, i) => { const ls = diffs.map(d => d.level).filter(l => l > i * 5 && l <= i * 5 + 5); return ls.length ? <Button key={r} size="sm" variant="outline" onClick={() => setLevels(ls, !ls.every(l => picks[l] === 'all'))}>{r}</Button> : null; })}</div>
    {diffs.length === 0 && <p className="text-muted-foreground">Уровни не отличаются от текущих.</p>}
    {diffs.map(d => { const all = ids(d); return <div key={d.level} className="grid gap-1 rounded-md border border-border p-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={picks[d.level] === 'all'} onChange={e => setLevels([d.level], e.target.checked)} />Уровень {d.level} · {rankOf(d.level)} {levelInRank(d.level)} — целиком{d.costBefore !== d.costAfter && `, истощение ${d.costBefore} → ${d.costAfter}`}</label>
      {d.added.map(e => <label key={'a' + e.id} className="flex items-start gap-2 text-primary"><input type="checkbox" checked={has(d.level, e.id)} onChange={x => toggleEffect(d.level, all, e.id, x.target.checked)} /><span className="min-w-0 break-words">+ {effectLabel(e)}{e.description ? ` — ${e.description}` : ''}</span></label>)}
      {d.removed.map(e => <label key={'r' + e.id} className="flex items-start gap-2 text-destructive"><input type="checkbox" checked={has(d.level, e.id)} onChange={x => toggleEffect(d.level, all, e.id, x.target.checked)} /><span className="min-w-0 break-words">− {effectLabel(e)}</span></label>)}
      {d.changed.map(x => <label key={'c' + x.after.id} className="flex items-start gap-2"><input type="checkbox" checked={has(d.level, x.after.id)} onChange={y => toggleEffect(d.level, all, x.after.id, y.target.checked)} /><span className="min-w-0 break-words">{effectLabel(x.before)} → {effectLabel(x.after)}</span></label>)}
    </div>; })}
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!count && !takeMeta} onClick={() => onAccept(mergeSelection(def, proposal, picks, takeMeta, origin))}>Принять выбранное</Button><Button size="sm" variant="outline" onClick={onReject}>Отклонить</Button></div>
    <p className="text-xs text-muted-foreground">Отдельный эффект берётся без изменения стоимости истощения уровня; стоимость переносится только при выборе уровня целиком.</p>
  </div>;
}
