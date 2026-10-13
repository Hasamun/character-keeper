import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Character } from '@/lib/rules';
import { CATEGORY_LABELS, SLOT_KIND_LABELS, HAND_LABELS, SLOTS, type Item } from '@/lib/rules/inventory';
import { comparable, comparisonSlots, compareReplacement, type CompareSlot } from '@/lib/rules/derived';
import { effectLabel, ATTACK_MODE_LABELS } from '@/lib/rules/items';
import { cn } from '@/lib/utils';

export function ItemComparison({ c, item, open, onClose }: { c: Character; item: Item; open: boolean; onClose: () => void }) {
  const [otherId, setOtherId] = useState('');
  const [chosenSlot, setChosenSlot] = useState<CompareSlot | undefined>();
  const candidates = c.inventory.items.filter(i => comparable(item, i));
  const other = candidates.find(i => i.id === otherId);
  const slots = comparisonSlots(item);
  const slot = chosenSlot && slots.includes(chosenSlot) ? chosenSlot : slots[0];
  const result = other && slot ? compareReplacement(c, item.id, other.id, slot) : null;
  const rows: [string, (i: Item) => string][] = [
    ['Ранг', i => i.rank ?? 'F'], ['Тип', i => i.subtype ?? (i.slot ? SLOT_KIND_LABELS[i.slot] : CATEGORY_LABELS[i.category])], ['Урон', i => i.weapon ? `${i.weapon.damage} (${i.weapon.damageType})` : '—'], ['Бонус атаки', i => String(i.weapon?.attackBonus ?? 0)], ['Атака зависит от', i => i.weapon ? ATTACK_MODE_LABELS[i.weapon.attackMode] : '—'], ['Хват', i => i.weapon ? i.weapon.twoHanded ? 'Двуручное' : 'Одноручное' : '—'], ['Бонус КБ', i => String(i.armor?.ac ?? 0)], ['Требования', i => (i.requirements ?? []).map(r => `${r.stat} ≥ ${r.min}`).join('; ') || '—'], ['Эффекты', i => (i.effects ?? []).map(e => `${effectLabel(e)}${e.condition ? ` (${e.condition})` : ''}${e.charges != null ? ` · ${e.remainingCharges ?? e.charges}/${e.charges}` : ''}`).join('; ') || '—'], ['Цена', i => i.price == null ? '—' : `${i.price} зм`], ['Вес', i => String(i.weight ?? '—')],
  ];
  return <Dialog open={open} onOpenChange={o => !o && onClose()}><DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Сравнение предметов</DialogTitle><DialogDescription>{item.name} · {c.name}</DialogDescription></DialogHeader>
    <Select value={other?.id ?? ''} onValueChange={setOtherId}><SelectTrigger aria-label="Второй предмет"><SelectValue placeholder="Выберите второй предмет" /></SelectTrigger><SelectContent>{candidates.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent></Select>
    {!candidates.length && <p className="text-sm text-muted-foreground">Нет сопоставимых предметов.</p>}
    {slots.length > 0 && <Select value={slot ?? ""} onValueChange={v => { const found = slots.find(s => s === v); if (found) setChosenSlot(found); }}><SelectTrigger aria-label="Слот сравнения"><SelectValue /></SelectTrigger><SelectContent>{slots.map(s => <SelectItem key={s} value={s}>{s === 'main' || s === 'off' ? HAND_LABELS[s] : SLOTS.find(x => x.id === s)?.label}</SelectItem>)}</SelectContent></Select>}
    {other && <><div className="grid grid-cols-2 gap-3 text-sm font-semibold"><span className="break-words">{item.name}</span><span className="break-words">{other.name}</span></div>{rows.map(([label, read]) => <CompareRow key={label} label={label} a={read(item)} b={read(other)} />)}
    {result && <><h3 className="mt-3 font-semibold">Итоговые параметры · комплект {c.inventory.activeSet === 0 ? 'А' : 'Б'}</h3><CompareRow label="HP" a={String(result.first.hp ?? 'Вне таблицы')} b={String(result.second.hp ?? 'Вне таблицы')} /><CompareRow label="КБ" a={String(result.first.ac)} b={String(result.second.ac)} />{Object.keys(result.first.primary).map(n => <CompareRow key={n} label={n} a={String(result.first.primary[n])} b={String(result.second.primary[n])} />)}{Object.keys(result.first.secondary).filter(n => result.first.secondary[n] !== result.second.secondary[n]).map(n => <CompareRow key={n} label={n} a={String(result.first.secondary[n])} b={String(result.second.secondary[n])} />)}<CompareRow label="Атака / урон" a={result.first.weapons.map(w => `${w.name}: ${w.attack} / ${w.damage} + (${w.damageBonus})`).join('; ') || '—'} b={result.second.weapons.map(w => `${w.name}: ${w.attack} / ${w.damage} + (${w.damageBonus})`).join('; ') || '—'} /><CompareRow label="Сопротивления" a={result.first.resistances.join(', ') || '—'} b={result.second.resistances.join(', ') || '—'} /><CompareRow label="Уязвимости" a={result.first.vulnerabilities.join(', ') || '—'} b={result.second.vulnerabilities.join(', ') || '—'} />{[...new Set([...result.first.warnings, ...result.second.warnings])].map(w => <p key={w} className="text-sm text-destructive">{w}</p>)}</>}</>}
  </DialogContent></Dialog>;
}
function CompareRow({ label, a, b }: { label: string; a: string; b: string }) { return <div className={cn('border-b border-border py-2 text-sm', a !== b && 'bg-primary/5')}><div className="mb-1 text-xs text-muted-foreground">{label}</div><div className="grid grid-cols-2 gap-3"><span className="min-w-0 break-words">{a}</span><span className={cn('min-w-0 break-words', a !== b && 'text-primary')}>{b}</span></div></div>; }
