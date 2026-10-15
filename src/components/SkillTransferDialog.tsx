import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { TRANSFER_LABELS, type SkillInstance, type TransferMode } from '@/lib/rules/skills';
import type { Character } from '@/lib/rules';
import { offerSkillFn, transferSkillFn } from '@/lib/skills.functions';
import { useCharacters } from '@/lib/characters-store';

/** Teaching never removes the skill from the sender; another player must accept the offer. */
export function SkillTransferDialog({ c, s, open, onClose }: { c: Character; s: SkillInstance; open: boolean; onClose: () => void }) {
  const store = useCharacters(); const own = useServerFn(transferSkillFn); const offer = useServerFn(offerSkillFn); const qc = useQueryClient();
  const others = store.characters.filter(x => x.id !== c.id);
  const [kind, setKind] = useState<'own' | 'player'>(others.length ? 'own' : 'player');
  const [to, setTo] = useState(''); const [email, setEmail] = useState('');
  const [mode, setMode] = useState<TransferMode>('teach_novice'); const [busy, setBusy] = useState(false);
  const target = others.find(x => x.id === to);
  const go = async () => {
    setBusy(true);
    try {
      if (kind === 'own') {
        if (!target) throw new Error('Выберите героя');
        if ((target.skills ?? []).some(x => x.definition.name === s.definition.name) && !window.confirm(`У «${target.name}» уже есть «${s.definition.name}». Добавить ещё одну независимую копию?`)) return;
        await store.flush();
        const tv = store.version(target.id); if (!tv) throw new Error('Герой ещё не сохранён');
        await own({ data: { fromId: c.id, toId: target.id, skillId: s.id, mode, toVersion: tv } });
        toast.success(`«${target.name}» изучил «${s.definition.name}»`);
      } else {
        await store.flush();
        await offer({ data: { fromId: c.id, skillId: s.id, mode, email: email.trim() } });
        toast.success('Предложение отправлено. Навык появится у игрока после его подтверждения');
        void qc.invalidateQueries({ queryKey: ['skill-offers'] });
      }
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); await store.refresh().catch(() => undefined); }
  };
  const ready = kind === 'own' ? !!target : /.+@.+\..+/.test(email.trim());
  return <Dialog open={open} onOpenChange={o => !o && onClose()}><DialogContent className="wrap-safe"><DialogHeader><DialogTitle className="break-words">Обучить навыку: {s.definition.name}</DialogTitle><DialogDescription>Навык остаётся у «{c.name}». Получатель получит независимую копию без истощения, действующих эффектов и истории.</DialogDescription></DialogHeader>
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={kind === 'own' ? 'default' : 'outline'} disabled={!others.length} onClick={() => setKind('own')}>Мой герой</Button>
        <Button size="sm" variant={kind === 'player' ? 'default' : 'outline'} onClick={() => setKind('player')}>Другой игрок</Button>
      </div>
      {kind === 'own'
        ? <select aria-label="Получатель" className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2" value={to} onChange={e => setTo(e.target.value)}><option value="">Выберите героя…</option>{others.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        : <div className="grid gap-1"><Input type="email" aria-label="Почта игрока" placeholder="Почта аккаунта игрока" maxLength={320} value={email} onChange={e => setEmail(e.target.value)} /><p className="text-xs text-muted-foreground">Игрок увидит предложение на главной странице и сам выберет героя или откажется.</p></div>}
      {(Object.keys(TRANSFER_LABELS) as TransferMode[]).map(m => <label key={m} className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />{TRANSFER_LABELS[m]}{m === 'teach_current' && ` (ур. ${s.level})`}</label>)}
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Отмена</Button><Button disabled={busy || !ready} onClick={() => void go()}>{busy ? 'Отправляем…' : kind === 'own' ? 'Обучить' : 'Отправить предложение'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
