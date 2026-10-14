import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { TRANSFER_LABELS, type SkillInstance, type TransferMode } from '@/lib/rules/skills';
import type { Character } from '@/lib/rules';
import { transferSkillFn } from '@/lib/skills.functions';
import { useCharacters } from '@/lib/characters-store';

export function SkillTransferDialog({ c, s, open, onClose }: { c: Character; s: SkillInstance; open: boolean; onClose: () => void }) {
  const store = useCharacters(); const call = useServerFn(transferSkillFn);
  const others = store.characters.filter(x => x.id !== c.id);
  const [to, setTo] = useState(''); const [mode, setMode] = useState<TransferMode>('teach_novice'); const [busy, setBusy] = useState(false);
  const target = others.find(x => x.id === to);
  const go = async () => {
    if (!target) { toast.error('Выберите героя'); return; }
    if ((target.skills ?? []).some(x => x.definition.name === s.definition.name) && !window.confirm(`У «${target.name}» уже есть «${s.definition.name}». Добавить ещё одну независимую копию?`)) return;
    setBusy(true);
    try {
      await store.flush();
      const fv = store.version(c.id), tv = store.version(target.id); if (!fv || !tv) throw new Error('Герои ещё не сохранены');
      await call({ data: { fromId: c.id, toId: target.id, skillId: s.id, mode, fromVersion: fv, toVersion: tv } });
      toast.success(mode === 'move' ? `«${s.definition.name}» передан «${target.name}»` : `«${target.name}» получил «${s.definition.name}»`);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); await store.refresh().catch(() => undefined); }
  };
  return <Dialog open={open} onOpenChange={o => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Передать или обучить: {s.definition.name}</DialogTitle><DialogDescription>Получатель — ваш другой герой. Копия независима от исходного навыка.</DialogDescription></DialogHeader>
    {others.length === 0 ? <p className="text-sm text-muted-foreground">Нет других героев.</p> : <div className="grid gap-3 text-sm">
      <select aria-label="Получатель" className="h-9 rounded-md border border-border bg-background px-2" value={to} onChange={e => setTo(e.target.value)}><option value="">Выберите героя…</option>{others.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      {(Object.keys(TRANSFER_LABELS) as TransferMode[]).map(m => <label key={m} className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />{TRANSFER_LABELS[m]}{m === 'teach_current' && ` — ур. ${s.level}`}</label>)}
    </div>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Отмена</Button><Button disabled={busy || !target} onClick={() => void go()}>{busy ? 'Сохраняем…' : 'Выполнить'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
