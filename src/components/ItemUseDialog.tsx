import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import type { Character } from '@/lib/rules';
import type { Item } from '@/lib/rules/inventory';
import { activateEquipmentEffect, automatic, useItem, wornItems } from '@/lib/rules/derived';
import { effectLabel } from '@/lib/rules/items';

export function ItemUseActions({ c, item, save, afterUse }: { c: Character; item: Item; save: (c: Character) => void; afterUse?: () => void }) {
  const [pending, setPending] = useState<{ effectId?: string; label: string } | null>(null);
  const worn = wornItems(c).some(i => i.id === item.id);
  return <div className="flex flex-wrap gap-2">
    {item.category === 'consumable' && <Button size="sm" variant="outline" disabled={item.quantity <= 0} onClick={() => setPending({ label: `Использовать «${item.name}» — 1 шт.` })}>Использовать 1 шт.</Button>}
    {(item.effects ?? []).map(e => e.charges != null ? <Button key={e.id} size="sm" variant="outline" disabled={(e.remainingCharges ?? e.charges) <= 0 || item.category === 'gear' && !worn} onClick={() => setPending({ effectId: e.id, label: `${effectLabel(e)} — 1 заряд (${e.remainingCharges ?? e.charges}/${e.charges})` })}>{effectLabel(e)} · {e.remainingCharges ?? e.charges}/{e.charges}</Button>
      : item.category === 'gear' && !automatic(e) ? <Button key={e.id} size="sm" variant="outline" disabled={!worn || (c.activeEffects ?? []).some(a => a.equipmentBound && a.sourceItemId === item.id && a.effect.id === e.id)} onClick={() => save(activateEquipmentEffect(c, item.id, e.id))}>Включить: {effectLabel(e)}</Button> : null)}
    <AlertDialog open={pending !== null} onOpenChange={o => !o && setPending(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Использовать предмет?</AlertDialogTitle><AlertDialogDescription>{pending?.label}. {pending?.effectId ? 'Количество предметов не изменится.' : 'Заряды не списываются.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => { if (!pending) return; const result = useItem(c, item.id, pending.effectId); if (result.error) toast.error(result.error); else { save(result.character); afterUse?.(); } setPending(null); }}>Использовать</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
