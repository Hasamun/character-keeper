import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeftRight, Coins, LayoutGrid, List, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ItemCard, ItemRow } from "@/components/ItemCard";
import { ItemEditor, blankItem } from "@/components/ItemEditor";
import { pushLog, type Character } from "@/lib/rules";
import { RANKS, equipmentWarnings, itemRank, type Rank } from "@/lib/rules/items";
import {
  CATEGORY_LABELS, HAND_LABELS, MONEY_LABELS, SLOTS, SLOT_KIND_LABELS,
  addItem, canEquipHand, canEquipSlot, equipHand, equipSlot, findItem, isEquipped, putOnBelt, setMoney,
  swapWeapons, unequip,
  type Hand, type Inventory, type Item, type ItemCategory, type Money, type SlotId,
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
  const [query, setQuery] = useState("");
  const [rank, setRank] = useState<Rank | "all">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const navigate = useNavigate();

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

  const q = query.trim().toLowerCase();
  const shown = inv.items.filter((i) =>
    (filter === "all" || i.category === filter) && (rank === "all" || itemRank(i) === rank) &&
    (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)));
  const warnings = equipmentWarnings(c, inv);
  const open = (itemId: string) => navigate({ to: "/character/$id/item/$itemId", params: { id: c.id, itemId } });

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

      {warnings.length > 0 && (
        <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Предупреждения</div>
          <ul className="list-disc pl-5 text-muted-foreground">{warnings.map((w, k) => <li key={k}>{w.text}</li>)}</ul>
        </section>
      )}

      {/* Bag */}
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">Предметы</h2>
          <div className="flex gap-2">
            <Button size="icon" variant={view === "grid" ? "secondary" : "ghost"} aria-label="Сетка" onClick={() => setView("grid")}><LayoutGrid /></Button>
            <Button size="icon" variant={view === "list" ? "secondary" : "ghost"} aria-label="Список" onClick={() => setView("list")}><List /></Button>
            <Button variant="gold" size="sm" onClick={() => setEditing(blankItem())}><Plus /> Добавить</Button>
          </div>
        </div>
        <Input placeholder="Поиск по названию и описанию" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-3" />
        <div className="mb-2 flex flex-wrap gap-2">
          {(["all", "gear", "consumable", "misc"] as const).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "Все" : CATEGORY_LABELS[f]}</Chip>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip active={rank === "all"} onClick={() => setRank("all")}>Любой ранг</Chip>
          {RANKS.map((r) => <Chip key={r} active={rank === r} onClick={() => setRank(r)} className={`rank-${r}`}><span className="rank-text font-display">{r}</span></Chip>)}
        </div>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{inv.items.length ? "Ничего не найдено." : "Здесь пока пусто."}</p>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((i) => <ItemCard key={i.id} i={i} equipped={isEquipped(inv, i.id)} onClick={() => open(i.id)} />)}
          </div>
        ) : (
          <div className="grid gap-2">
            {shown.map((i) => <ItemRow key={i.id} i={i} equipped={isEquipped(inv, i.id)} onClick={() => open(i.id)} />)}
          </div>
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
      <ItemEditor
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(item) => {
          const r = addItem(inv, item);
          commit(r.inventory, r.mergedInto ? `«${item.name}» ×${item.quantity} добавлено в стопку` : `Добавлен предмет «${item.name.trim()}»`);
          setEditing(null);
        }}
      />
    </div>
  );
}

function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-sm transition", className,
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
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

function SlotButton({ label, item, onClick }: { label: string; item?: Item | undefined; onClick: () => void }) {
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
  target: Target | null; occupant?: Item | undefined; candidates: Item[]; onClose: () => void; onPick: (id: string) => void; onRemove: (id: string) => void;
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

