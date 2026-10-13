import { Button } from '@/components/ui/button';
import type { Character } from '@/lib/rules';
import { deriveCharacter, endEffect } from '@/lib/rules/derived';
import { effectLabel } from '@/lib/rules/items';
export function DerivedStats({ c, save }: { c: Character; save: (c: Character) => void }) {
  const d = deriveCharacter(c);
  return <section className="mb-5 grid gap-3 border-b border-border pb-5">
    <h2 className="text-lg">Боевые параметры</h2>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>HP: <b>{d.hp ?? 'Вне таблицы'}</b> · база {d.baseHp}</span><span>КБ: <b>{d.ac}</b> · база {d.baseAc}</span><span>Бонус атаки: {d.attackBonus}</span><span>Бонус урона: {d.damageBonus}</span></div>
    {d.weapons.map(w => <div key={w.hand} className="text-sm"><b>{w.name}</b> · атака {w.attack >= 0 ? '+' : ''}{w.attack} · урон {w.damage}{w.damageBonus ? ` ${w.damageBonus > 0 ? '+' : '−'} ${Math.abs(w.damageBonus)}` : ''} {w.damageType}</div>)}
    {d.resistances.length > 0 && <p className="text-sm">Сопротивления: {d.resistances.join(', ')}</p>}{d.vulnerabilities.length > 0 && <p className="text-sm">Уязвимости: {d.vulnerabilities.join(', ')}</p>}{d.extraDamage.map((v,k) => <p key={k} className="text-sm">Дополнительный урон: {v}</p>)}
    {d.sources.length > 0 && <details><summary className="cursor-pointer text-sm text-primary">Источники бонусов</summary><ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{d.sources.map((s,k) => <li key={k}>{s}</li>)}</ul></details>}
    {d.descriptions.map((s,k) => <p key={k} className="text-sm text-muted-foreground">{s}</p>)}{d.warnings.map(w => <p key={w} className="text-sm text-destructive">{w}</p>)}
    {(c.activeEffects ?? []).length > 0 && <div className="grid gap-2"><h3 className="text-sm font-semibold">Активные эффекты</h3>{c.activeEffects?.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2"><div className="min-w-0 break-words text-sm">{effectLabel(a.effect)} · {a.sourceName}{a.effect.duration && <span className="text-muted-foreground"> · {a.effect.duration}</span>}</div><Button size="sm" variant="outline" onClick={() => save(endEffect(c, a.id))}>Завершить</Button></div>)}</div>}
  </section>;
}
