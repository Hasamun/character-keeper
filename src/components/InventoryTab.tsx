import { useState } from "react";
import { ArrowLeftRight, Check, Coins, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pushLog, uid, type Character } from "@/lib/rules";
import {
  CATEGORY_LABELS, HAND_LABELS, MAX_BELT, MIN_BELT, MONEY_LABELS, SLOTS, SLOT_KIND_LABELS,
  canEquipHand, canEquipSlot, equipHand, equipSlot, findItem, isEquipped, putOnBelt, removeItem, setMoney,
  swapWeapons, unequip, upsertItem,
  type Hand, type Inventory, type Item, type ItemCategory, type ItemSlotKind, type Money, type SlotId,
} from "@/lib/rules/inventory";
import { cn } from "@/lib/utils";

type Target = { kind: "slot"; slot: SlotId } | { kind: "hand"; set: 0 | 1; hand: Hand } | { kind: "belt"; index: number };

const MONEY_STYLE: Record<keyof Money, string> = {
  copper: "text-stat-str", silver: "text-muted-foreground", gold: "text-primary", platinum: "text-stat-con",
};

export function InventoryTab({ c, save }: { c: Character; save: (c: Character) => void }) {
  const inv = c.inventory;
  const [filter, setFilter] = useState<ItemCategory | "all">("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [picking, setPicking] = useState<Target | null>(null);

  const commit = (inventory: Inventory, log?: string) => {
    const next = { ...c, inventory, log: [...c.log] };
    if (log) pushLog(next, log);
    save(next);
  };
  const run = (r: { inventory: Inventory; error: string | null; log?: string }) => {
    if (r.error) { toast.error(r.error); return false; }
    commit(r.inventory, r.log);
    return true;
  };

  const occupant = (t: Target) =>
    findItem(inv, t.kind === "slot" ? inv.equipped[t.slot] : t.kind === "hand" ? inv.weaponSets[t.set][t.hand] : inv.belt[t.index]);

  const candidates = (t: Target) =>
    inv.items.filter((i) =>
      t.kind === "slot" ? canEquipSlot(i, t.slot) : t.kind === "hand" ? canEquipHand(i, t.hand) : i.category === "consumable",
    );

  const onPick = (itemId: string) => {
    if (!picking) return;
    const r = picking.kind === "slot" ? equipSlot(inv, itemId, picking.slot)
      : picking.kind === "hand" ? equipHand(inv, itemId, picking.set, picking.hand)
      : putOnBelt(inv, itemId, picking.index);
    if (run(r)) setPicking(null);
  };

  const shown = inv.items.filter((i) => filter === "all" || i.category === filter);

  return (
    <div className="grid gap-5">
      {/* Money */}
      <section className="panel p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg"><Coins className="h-5 w-5 text-primary" /> Деньги</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(MONEY_LABELS) as (keyof Money)[]).map((k) => (
            <MoneyField key={k} label={MONEY_LABELS[k]} value={inv.money[k]} className={MONEY_STYLE[k]}
              onChange={(v) => commit(setMoney(inv, k, v), `${MONEY_LABELS[k]}: ${inv.money[k]} → ${Math.max(0, v)}`)} />
          ))}
        </div>
      </section>

      {/* Equipment */}
      <section className="panel p-4">
        <h2 className="mb-3 text-lg">Экипировка</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {SLOTS.map((s) => {
            const t: Target = { kind: "slot", slot: s.id };
            return <SlotButton key={s.id} label={s.label} item={occupant(t)} onClick={() => setPicking(t)} />;
          })}
        </div>

        {inv.belt.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Пояс — быстрый доступ</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {inv.belt.map((_, i) => {
                const t: Target = { kind: "belt", index: i };
                return <SlotButton key={i} label={`Ячейка ${i + 1}`} item={occupant(t)} onClick={() => setPicking(t)} />;
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <h3 className="text-base">Оружие</h3>
          <Button variant="outline" size="sm" onClick={() => run(swapWeapons(inv))}><ArrowLeftRight /> Сменить оружие</Button>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {([0, 1] as const).map((set) => {
            const active = inv.activeSet === set;
            return (
              <div key={set} className={cn("rounded-lg border p-3 transition", active ? "border-primary/60 bg-primary/5" : "border-border opacity-60")}>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Комплект {set === 0 ? "А" : "Б"} · {active ? <span className="text-primary">в руках</span> : "за спиной"}
                </div>
                <div className="grid gap-2">
                  {(["main", "off"] as Hand[]).map((hand) => {
                    const t: Target = { kind: "hand", set, hand };
                    return <SlotButton key={hand} label={HAND_LABELS[hand]} item={occupant(t)} onClick={() => setPicking(t)} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bag */}
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">Предметы</h2>
          <Button variant="gold" size="sm" onClick={() => setEditing({ id: uid(), name: "", category: "misc", quantity: 1, description: "" })}>
            <Plus /> Добавить предмет
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "gear", "consumable", "misc"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-full border px-3 py-1 text-sm transition",
                filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {f === "all" ? "Все" : CATEGORY_LABELS[f]}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Здесь пока пусто.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {shown.map((i) => {
              const eq = isEquipped(inv, i.id);
              return (
                <li key={i.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.name}</span>
                      {i.quantity > 1 && <span className="text-xs text-muted-foreground">×{i.quantity}</span>}
                      {eq && <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary"><Check className="h-3 w-3" /> надето</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[i.category]}
                      {i.slot && ` · ${SLOT_KIND_LABELS[i.slot]}`}
                      {i.slot === "belt" && ` · ${i.beltCapacity} яч.`}
                    </div>
                    {i.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{i.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {eq ? (
                      <Button size="sm" variant="outline" onClick={() => run(unequip(inv, i.id))}>Снять</Button>
                    ) : i.category !== "misc" && (i.category === "consumable" ? inv.belt.length > 0 : !!i.slot) ? (
                      <Button size="sm" variant="outline" onClick={() => quickEquip(inv, i, run)}>
                        {i.category === "consumable" ? "На пояс" : "Надеть"}
                      </Button>
                    ) : null}
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Изменить" onClick={() => setEditing(i)}><Pencil /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Удалить"
                      onClick={() => commit(removeItem(inv, i.id), `Удалён предмет «${i.name}»`)}><Trash2 /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PickerDialog
        target={picking}
        occupant={picking ? occupant(picking) : undefined}
        candidates={picking ? candidates(picking) : []}
        onClose={() => setPicking(null)}
        onPick={onPick}
        onRemove={(id) => { if (run(unequip(inv, id))) setPicking(null); }}
      />
      <ItemDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(item) => {
          const isNew = !findItem(inv, item.id);
          commit(upsertItem(inv, item), isNew ? `Добавлен предмет «${item.name.trim() || "Без названия"}»` : undefined);
          setEditing(null);
        }}
      />
    </div>
  );
}

/** Equip into the first fitting free slot (or the first fitting one). */
function quickEquip(inv: Inventory, i: Item, run: (r: { inventory: Inventory; error: string | null; log?: string }) => boolean) {
  if (i.category === "consumable") {
    const free = inv.belt.findIndex((b) => b === null);
    if (free < 0) { toast.error("На поясе нет свободных ячеек"); return; }
    run(putOnBelt(inv, i.id, free));
    return;
  }
  if (i.slot === "weapon" || i.slot === "offhand") {
    const set = inv.activeSet;
    const hand: Hand = i.slot === "offhand" ? "off" : inv.weaponSets[set].main ? "off" : "main";
    run(equipHand(inv, i.id, set, hand));
    return;
  }
  const fitting = SLOTS.filter((s) => s.kind === i.slot);
  const slot = fitting.find((s) => !inv.equipped[s.id]) ?? fitting[0];
  if (slot) run(equipSlot(inv, i.id, slot.id));
}

function MoneyField({ label, value, className, onChange }: { label: string; value: number; className: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2">
      <div className={cn("mb-1 text-center text-xs font-semibold uppercase tracking-wider", className)}>{label}</div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Убавить ${label}`} onClick={() => onChange(value - 1)}><Minus /></Button>
        <Input
          inputMode="numeric" className="h-8 px-1 text-center tabular-nums"
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => { if (draft !== null && Number(draft) !== value) onChange(Number(draft) || 0); setDraft(null); }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Прибавить ${label}`} onClick={() => onChange(value + 1)}><Plus /></Button>
      </div>
    </div>
  );
}

function SlotButton({ label, item, onClick }: { label: string; item?: Item; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("rounded-lg border px-3 py-2 text-left transition hover:border-primary/60",
        item ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-muted/30")}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("truncate text-sm", item ? "text-foreground" : "text-muted-foreground/60")}>{item ? item.name : "пусто"}</div>
    </button>
  );
}

function PickerDialog({ target, occupant, candidates, onClose, onPick, onRemove }: {
  target: Target | null; occupant?: Item; candidates: Item[]; onClose: () => void; onPick: (id: string) => void; onRemove: (id: string) => void;
}) {
  const title = !target ? "" : target.kind === "slot" ? SLOTS.find((s) => s.id === target.slot)!.label
    : target.kind === "hand" ? `${HAND_LABELS[target.hand]} · комплект ${target.set === 0 ? "А" : "Б"}` : `Пояс · ячейка ${target.index + 1}`;
  const options = candidates.filter((i) => i.id !== occupant?.id);
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-gold">{title}</DialogTitle>
          <DialogDescription>{occupant ? `Сейчас: ${occupant.name}` : "Слот пуст"}</DialogDescription>
        </DialogHeader>
        {occupant && <Button variant="outline" onClick={() => onRemove(occupant.id)}><X /> Снять «{occupant.name}»</Button>}
        <div className="grid max-h-72 gap-2 overflow-y-auto">
          {options.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Нет подходящих предметов. Добавьте их в списке предметов.</p>
          ) : options.map((i) => (
            <button key={i.id} onClick={() => onPick(i.id)} className="rounded-lg border border-border px-3 py-2 text-left transition hover:border-primary/60 hover:bg-primary/5">
              <div className="text-sm">{i.name}</div>
              <div className="text-xs text-muted-foreground">{i.slot ? SLOT_KIND_LABELS[i.slot] : CATEGORY_LABELS[i.category]}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({ item, onClose, onSave }: { item: Item | null; onClose: () => void; onSave: (i: Item) => void }) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {item && <ItemForm key={item.id} initial={item} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({ initial, onSave }: { initial: Item; onSave: (i: Item) => void }) {
  const [i, setI] = useState<Item>(initial);
  const isNew = !initial.name;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display text-gold">{isNew ? "Новый предмет" : "Изменить предмет"}</DialogTitle>
        <DialogDescription>Предмет попадёт в общий список. Снаряжение можно надеть, расходники — положить на пояс.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="item-name">Название</Label>
          <Input id="item-name" value={i.name} maxLength={120} onChange={(e) => setI({ ...i, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Категория</Label>
            <Select value={i.category} onValueChange={(v) => setI({ ...i, category: v as ItemCategory, slot: v === "gear" ? i.slot ?? "weapon" : undefined })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((k) => <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="item-qty">Количество</Label>
            <Input id="item-qty" type="number" min={1} value={i.quantity} onChange={(e) => setI({ ...i, quantity: Number(e.target.value) })} />
          </div>
        </div>
        {i.category === "gear" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Слот</Label>
              <Select value={i.slot ?? "weapon"} onValueChange={(v) => setI({ ...i, slot: v as ItemSlotKind, beltCapacity: v === "belt" ? i.beltCapacity ?? 2 : undefined })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(SLOT_KIND_LABELS) as ItemSlotKind[]).map((k) => <SelectItem key={k} value={k}>{SLOT_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {i.slot === "belt" && (
              <div className="grid gap-1.5">
                <Label>Ячеек на поясе</Label>
                <Select value={String(i.beltCapacity ?? 2)} onValueChange={(v) => setI({ ...i, beltCapacity: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: MAX_BELT - MIN_BELT + 1 }, (_, k) => k + MIN_BELT).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="item-desc">Описание</Label>
          <Textarea id="item-desc" rows={3} value={i.description} onChange={(e) => setI({ ...i, description: e.target.value })} />
        </div>
        <Button variant="gold" onClick={() => {
          if (!i.name.trim()) { toast.error("Введите название"); return; }
          onSave({ ...i, slot: i.category === "gear" ? i.slot ?? "weapon" : undefined });
        }}>Сохранить</Button>
      </div>
    </>
  );
}
