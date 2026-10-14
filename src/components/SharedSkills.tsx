import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { effectLabel } from '@/lib/rules/items';
import { costAt, exhaustionBand, levelInRank, needsExhaustionConfirm, normalizeSkills, rankOf, resolveLevel, xpToNext, type SkillAction } from '@/lib/rules/skills';
import { skillAction } from '@/lib/skills.functions';

/** Skills section of a shared hero: read for `read`, actions through the same server journal for `edit`. */
export function SharedSkills({ id, version, raw, exhaustion, editable, onDone }: { id: string; version: string; raw: unknown; exhaustion: number; editable: boolean; onDone: () => void }) {
  const call = useServerFn(skillAction); const [busy, setBusy] = useState(false);
  const [xp, setXp] = useState<Record<string, string>>({}); const [reason, setReason] = useState<Record<string, string>>({});
  const skills = normalizeSkills(raw);
  const run = async (action: SkillAction, ok: string) => {
    setBusy(true);
    try { await call({ data: { id, opId: crypto.randomUUID(), version, action } }); toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); onDone(); }
  };
  return <section className="grid gap-3">
    <p className="text-sm">Истощение: <b>{exhaustion}</b> <span className="text-muted-foreground">({exhaustionBand(exhaustion).label})</span></p>
    {skills.length === 0 && <p className="text-sm text-muted-foreground">У героя нет навыков</p>}
    {skills.map(s => { const d = s.definition, need = xpToNext(d.type, s.level), cost = costAt(d, s.level); return <div key={s.id} className="panel grid gap-2 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><div><b>{d.name}</b> <span className="text-xs text-muted-foreground">{d.type === 'active' ? 'Активный' : 'Пассивный'} · {rankOf(s.level)} {levelInRank(s.level)} (ур. {s.level}){d.type === 'active' && ` · истощение ${cost}`}</span></div>
        {editable && d.type === 'active' && <Button size="sm" disabled={busy} onClick={() => { if (needsExhaustionConfirm(exhaustion, cost) && !window.confirm(`Истощение станет ${exhaustion + cost}. Применить «${d.name}»?`)) return; void run({ type: 'apply', skillId: s.id }, `«${d.name}» применён`); }}>Применить</Button>}</div>
      <div className="flex items-center gap-2"><Progress value={need ? (s.xp / need) * 100 : 100} className="h-1.5" /><span className="shrink-0 text-xs text-muted-foreground">{need ? `${s.xp}/${need} XP` : 'Максимум'}</span></div>
      {resolveLevel(d, s.level).map(e => <div key={e.id} className="text-xs text-muted-foreground">{effectLabel(e)}{e.description ? ` — ${e.description}` : ''}</div>)}
      {editable && <div className="grid gap-2 sm:grid-cols-[7rem_1fr_auto]"><Input type="number" placeholder="± XP" value={xp[s.id] ?? ''} onChange={e => setXp({ ...xp, [s.id]: e.target.value })} /><Input placeholder="Причина" maxLength={500} value={reason[s.id] ?? ''} onChange={e => setReason({ ...reason, [s.id]: e.target.value })} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { const n = Math.trunc(Number(xp[s.id])); const r = (reason[s.id] ?? '').trim(); if (!n || !r) { toast.error('Нужны целое число и причина'); return; } void run({ type: 'xp', skillId: s.id, delta: n, reason: r }, 'XP изменён'); setXp({ ...xp, [s.id]: '' }); }}>Изменить XP</Button></div>}
    </div>; })}
  </section>;
}
