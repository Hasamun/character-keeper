import { useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIMARY_STAT_NAMES, uid } from "@/lib/rules";
import { CATEGORY_LABELS, MAX_BELT, MIN_BELT, SLOT_KIND_LABELS, type Item, type ItemCategory, type ItemSlotKind } from "@/lib/rules/inventory";
import {
  ATTACK_MODE_LABELS, DAMAGE_TYPES, EFFECT_KIND_LABELS, RANKS, SUBTYPES,
  type AttackMode, type Effect, type EffectKind, type Rank,
} from "@/lib/rules/items";
import { IMAGE_TYPES, uploadItemImage, useItemImage } from "@/lib/item-images";

export const blankItem = (): Item => ({ id: uid(), name: "", category: "misc", quantity: 1, description: "", rank: "F" });

export function ItemEditor({ item, onClose, onSave }: { item: Item | null; onClose: () => void; onSave: (i: Item) => void }) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        {item && <Form key={item.id} initial={item} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

const numOrU = (v: string) => (v.trim() === "" ? undefined : Number(v));

function Sel<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Record<T, string> | readonly T[]; label: string }) {
  const entries = Array.isArray(options) ? (options as readonly T[]).map((k) => [k, k] as const) : (Object.entries(options) as [T, string][]);
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{entries.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function Form({ initial, onSave }: { initial: Item; onSave: (i: Item) => void }) {
  const [i, setI] = useState<Item>(initial);
  const [uploading, setUploading] = useState(false);
  const preview = useItemImage(i.thumb ?? i.image);
  const isNew = !initial.name;
  const set = (p: Partial<Item>) => setI((x) => ({ ...x, ...p }));
  const isWeapon = i.category === "gear" && (i.slot === "weapon" || i.slot === "offhand");
  const isArmor = i.category === "gear" && i.slot !== "weapon" && i.slot !== "belt";
  const subtypeKey = i.category === "gear" ? i.slot : i.category;
  const subs = (subtypeKey && SUBTYPES[subtypeKey]) ?? [];

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) { toast.error("Только PNG, JPEG или WebP"); return; }
    setUploading(true);
    try { set(await uploadItemImage(i.id, f)); } catch (e) { toast.error((e as Error).message); }
    setUploading(false);
  };

  const setEffect = (idx: number, p: Partial<Effect>) => set({ effects: (i.effects ?? []).map((e, k) => (k === idx ? { ...e, ...p } : e)) });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display text-gold">{isNew ? "Новый предмет" : "Изменить предмет"}</DialogTitle>
        <DialogDescription>Изменения касаются только этого экземпляра предмета.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="flex gap-3">
          <label className="grid h-24 w-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground hover:border-primary/60">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
            <input type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <div className="grid flex-1 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="it-name">Название</Label>
              <Input id="it-name" value={i.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="text-xs text-muted-foreground">{uploading ? "Загружаем картинку…" : "Картинка: PNG, JPEG, WebP до 10 МБ"}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Sel label="Ранг" value={i.rank ?? "F"} options={RANKS} onChange={(v: Rank) => set({ rank: v })} />
          <Sel label="Категория" value={i.category} options={CATEGORY_LABELS}
            onChange={(v: ItemCategory) => set({ category: v, slot: v === "gear" ? i.slot ?? "weapon" : undefined, subtype: undefined })} />
          {i.category === "gear" && (
            <Sel label="Тип" value={i.slot ?? "weapon"} options={SLOT_KIND_LABELS}
              onChange={(v: ItemSlotKind) => set({ slot: v, subtype: undefined, beltCapacity: v === "belt" ? i.beltCapacity ?? 2 : undefined })} />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="it-sub">Подтип</Label>
            <Input id="it-sub" list="it-sub-list" value={i.subtype ?? ""} onChange={(e) => set({ subtype: e.target.value || undefined })} />
            <datalist id="it-sub-list">{subs.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="it-qty">Количество</Label>
            <Input id="it-qty" type="number" min={1} value={i.quantity} onChange={(e) => set({ quantity: Number(e.target.value) })} />
          </div>
          {i.slot === "belt" && i.category === "gear" && (
            <Sel label="Ячеек на поясе" value={String(i.beltCapacity ?? 2)}
              options={Array.from({ length: MAX_BELT - MIN_BELT + 1 }, (_, k) => String(k + MIN_BELT))}
              onChange={(v) => set({ beltCapacity: Number(v) })} />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="it-w">Вес</Label>
            <Input id="it-w" type="number" min={0} step="0.1" value={i.weight ?? ""} onChange={(e) => set({ weight: numOrU(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="it-p">Цена, зм</Label>
            <Input id="it-p" type="number" min={0} value={i.price ?? ""} onChange={(e) => set({ price: numOrU(e.target.value) })} />
          </div>
        </div>

        {isWeapon && (
          <fieldset className="grid gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs uppercase tracking-wider text-muted-foreground">Оружие</legend>
            {(() => {
              const w = i.weapon ?? { damage: "", attackBonus: 0, damageType: DAMAGE_TYPES[0] as string, attackMode: "fixed" as AttackMode, twoHanded: false };
              const sw = (p: Partial<typeof w>) => set({ weapon: { ...w, ...p } });
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label htmlFor="it-dmg">Урон</Label>
                    <Input id="it-dmg" placeholder="1d8" value={w.damage} onChange={(e) => sw({ damage: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label htmlFor="it-atk">Бонус атаки</Label>
                    <Input id="it-atk" type="number" value={w.attackBonus} onChange={(e) => sw({ attackBonus: Number(e.target.value) || 0 })} /></div>
                  <Sel label="Тип урона" value={w.damageType || DAMAGE_TYPES[0]} options={DAMAGE_TYPES} onChange={(v) => sw({ damageType: v })} />
                  <Sel label="Урон зависит от" value={w.attackMode} options={ATTACK_MODE_LABELS} onChange={(v: AttackMode) => sw({ attackMode: v })} />
                  <label className="col-span-2 flex items-center gap-2 text-sm"><Switch checked={w.twoHanded} onCheckedChange={(v) => sw({ twoHanded: v })} /> Двуручное</label>
                </div>
              );
            })()}
          </fieldset>
        )}

        {isArmor && (
          <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs uppercase tracking-wider text-muted-foreground">Защита</legend>
            <div className="grid gap-1.5"><Label htmlFor="it-ac">Бонус КБ</Label>
              <Input id="it-ac" type="number" value={i.armor?.ac ?? 0} onChange={(e) => set({ armor: { armorType: i.armor?.armorType ?? "", ac: Number(e.target.value) || 0 } })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="it-at">Тип брони</Label>
              <Input id="it-at" value={i.armor?.armorType ?? ""} onChange={(e) => set({ armor: { ac: i.armor?.ac ?? 0, armorType: e.target.value } })} /></div>
          </fieldset>
        )}

        <fieldset className="grid gap-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs uppercase tracking-wider text-muted-foreground">Требования</legend>
          {(i.requirements ?? []).map((r, k) => (
            <div key={k} className="flex items-end gap-2">
              <div className="flex-1"><Sel label="Характеристика" value={r.stat} options={PRIMARY_STAT_NAMES}
                onChange={(v) => set({ requirements: i.requirements!.map((x, j) => (j === k ? { ...x, stat: v } : x)) })} /></div>
              <div className="grid w-20 gap-1.5"><Label>Мин.</Label>
                <Input type="number" value={r.min} onChange={(e) => set({ requirements: i.requirements!.map((x, j) => (j === k ? { ...x, min: Number(e.target.value) || 0 } : x)) })} /></div>
              <Button size="icon" variant="ghost" aria-label="Убрать требование" onClick={() => set({ requirements: i.requirements!.filter((_, j) => j !== k) })}><Trash2 /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => set({ requirements: [...(i.requirements ?? []), { stat: "Сила", min: 1 }] })}><Plus /> Требование</Button>
        </fieldset>

        <fieldset className="grid gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs uppercase tracking-wider text-muted-foreground">Эффекты</legend>
          {(i.effects ?? []).map((e, k) => (
            <div key={e.id} className="grid gap-2 rounded-md bg-muted/30 p-2">
              <div className="flex items-end gap-2">
                <div className="flex-1"><Sel label="Тип" value={e.kind} options={EFFECT_KIND_LABELS} onChange={(v: EffectKind) => setEffect(k, { kind: v })} /></div>
                <Button size="icon" variant="ghost" aria-label="Убрать эффект" onClick={() => set({ effects: i.effects!.filter((_, j) => j !== k) })}><Trash2 /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="grid gap-1"><Label className="text-xs">Цель / название</Label>
                  <Input value={e.target} placeholder={e.kind === "stat" ? "Сила" : ""} onChange={(ev) => setEffect(k, { target: ev.target.value })} /></div>
                <div className="grid gap-1"><Label className="text-xs">Величина</Label>
                  <Input type="number" value={e.value} onChange={(ev) => setEffect(k, { value: Number(ev.target.value) || 0 })} /></div>
                <div className="grid gap-1"><Label className="text-xs">Тип урона</Label>
                  <Input list="it-dt" value={e.damageType ?? ""} onChange={(ev) => setEffect(k, { damageType: ev.target.value || undefined })} /></div>
                <div className="grid gap-1"><Label className="text-xs">Условие</Label>
                  <Input value={e.condition ?? ""} onChange={(ev) => setEffect(k, { condition: ev.target.value || undefined })} /></div>
                <div className="grid gap-1"><Label className="text-xs">Длительность</Label>
                  <Input value={e.duration ?? ""} onChange={(ev) => setEffect(k, { duration: ev.target.value || undefined })} /></div>
                <div className="grid gap-1"><Label className="text-xs">Заряды</Label>
                  <Input type="number" min={0} value={e.charges ?? ""} onChange={(ev) => setEffect(k, { charges: numOrU(ev.target.value) })} /></div>
              </div>
              <Input placeholder="Описание правила (необязательно)" value={e.description ?? ""} onChange={(ev) => setEffect(k, { description: ev.target.value || undefined })} />
            </div>
          ))}
          <datalist id="it-dt">{DAMAGE_TYPES.map((d) => <option key={d} value={d} />)}</datalist>
          <Button size="sm" variant="outline" onClick={() => set({ effects: [...(i.effects ?? []), { id: uid(), kind: "stat", target: "", value: 1, automation: "auto" }] })}><Plus /> Эффект</Button>
        </fieldset>

        <div className="grid gap-1.5"><Label htmlFor="it-desc">Описание</Label>
          <Textarea id="it-desc" rows={3} value={i.description} onChange={(e) => set({ description: e.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="it-lore">Предыстория</Label>
          <Textarea id="it-lore" rows={2} value={i.lore ?? ""} onChange={(e) => set({ lore: e.target.value || undefined })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label htmlFor="it-auth">Автор</Label>
            <Input id="it-auth" value={i.author ?? ""} onChange={(e) => set({ author: e.target.value || undefined })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="it-src">Источник</Label>
            <Input id="it-src" value={i.source ?? ""} onChange={(e) => set({ source: e.target.value || undefined })} /></div>
        </div>

        <Button variant="gold" disabled={uploading} onClick={() => {
          if (!i.name.trim()) { toast.error("Введите название"); return; }
          onSave({
            ...i,
            slot: i.category === "gear" ? i.slot ?? "weapon" : undefined,
            weapon: isWeapon ? i.weapon : undefined,
            armor: isArmor ? i.armor : undefined,
          });
        }}>Сохранить</Button>
      </div>
    </>
  );
}
