// Inventory model and pure operations. Items always stay in `items`; slots hold item ids.

export type ItemCategory = "gear" | "consumable" | "misc";
export type ItemSlotKind =
  | "helmet" | "chest" | "bracers" | "gloves" | "legs" | "boots" | "earrings" | "amulet" | "ring"
  | "weapon" | "offhand" | "belt";
export type SlotId =
  | "helmet" | "chest" | "bracers" | "gloves" | "legs" | "boots" | "earrings" | "amulet" | "ring1" | "ring2" | "belt";
export type Hand = "main" | "off";

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  slot?: ItemSlotKind | undefined;
  beltCapacity?: number | undefined;
  quantity: number;
  description: string;
}
export interface Money { copper: number; silver: number; gold: number; platinum: number }
export interface WeaponSet { main: string | null; off: string | null }
export interface Inventory {
  money: Money;
  items: Item[];
  equipped: Record<SlotId, string | null>;
  weaponSets: [WeaponSet, WeaponSet];
  activeSet: 0 | 1;
  belt: (string | null)[];
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = { gear: "Снаряжение", consumable: "Расходники", misc: "Прочее" };
export const MONEY_LABELS: Record<keyof Money, string> = { copper: "Медь", silver: "Серебро", gold: "Золото", platinum: "Платина" };
export const SLOT_KIND_LABELS: Record<ItemSlotKind, string> = {
  helmet: "Шлем", chest: "Нагрудник", bracers: "Наручи", gloves: "Перчатки", legs: "Поножи", boots: "Ботинки",
  earrings: "Серьги", amulet: "Амулет", ring: "Кольцо", weapon: "Оружие", offhand: "Щит / вторая рука", belt: "Пояс",
};
export const SLOTS: { id: SlotId; label: string; kind: ItemSlotKind }[] = [
  { id: "helmet", label: "Шлем", kind: "helmet" },
  { id: "chest", label: "Нагрудник", kind: "chest" },
  { id: "bracers", label: "Наручи", kind: "bracers" },
  { id: "gloves", label: "Перчатки", kind: "gloves" },
  { id: "legs", label: "Поножи", kind: "legs" },
  { id: "boots", label: "Ботинки", kind: "boots" },
  { id: "earrings", label: "Серьги", kind: "earrings" },
  { id: "amulet", label: "Амулет", kind: "amulet" },
  { id: "ring1", label: "Кольцо 1", kind: "ring" },
  { id: "ring2", label: "Кольцо 2", kind: "ring" },
  { id: "belt", label: "Пояс", kind: "belt" },
];
export const HAND_LABELS: Record<Hand, string> = { main: "Основная рука", off: "Вторая рука / щит" };
export const MIN_BELT = 1;
export const MAX_BELT = 4;

export function emptyInventory(): Inventory {
  return {
    money: { copper: 0, silver: 0, gold: 0, platinum: 0 },
    items: [],
    equipped: Object.fromEntries(SLOTS.map((s) => [s.id, null])) as Record<SlotId, string | null>,
    weaponSets: [{ main: null, off: null }, { main: null, off: null }],
    activeSet: 0,
    belt: [],
  };
}

const copy = (inv: Inventory): Inventory => ({
  money: { ...inv.money },
  items: inv.items.map((i) => ({ ...i })),
  equipped: { ...inv.equipped },
  weaponSets: [{ ...inv.weaponSets[0] }, { ...inv.weaponSets[1] }],
  activeSet: inv.activeSet,
  belt: [...inv.belt],
});

export const findItem = (inv: Inventory, id: string | null | undefined) => (id ? inv.items.find((i) => i.id === id) : undefined);

export function isEquipped(inv: Inventory, id: string) {
  return (
    Object.values(inv.equipped).includes(id) ||
    inv.weaponSets.some((s) => s.main === id || s.off === id) ||
    inv.belt.includes(id)
  );
}

export const clampBelt = (n: number) => Math.max(MIN_BELT, Math.min(MAX_BELT, Math.trunc(n) || MIN_BELT));

export function canEquipSlot(item: Item, slot: SlotId) {
  const def = SLOTS.find((s) => s.id === slot);
  return item.category === "gear" && !!def && item.slot === def.kind;
}
export function canEquipHand(item: Item, hand: Hand) {
  if (item.category !== "gear") return false;
  return hand === "main" ? item.slot === "weapon" : item.slot === "weapon" || item.slot === "offhand";
}

function detach(inv: Inventory, id: string) {
  for (const k of Object.keys(inv.equipped) as SlotId[]) if (inv.equipped[k] === id) inv.equipped[k] = null;
  for (const s of inv.weaponSets) { if (s.main === id) s.main = null; if (s.off === id) s.off = null; }
  inv.belt = inv.belt.map((b) => (b === id ? null : b));
  if (!inv.equipped.belt) inv.belt = [];
}

type Result = { inventory: Inventory; error: string | null; log?: string };

export function equipSlot(inv: Inventory, itemId: string, slot: SlotId): Result {
  const item = findItem(inv, itemId);
  if (!item) return { inventory: inv, error: "Предмет не найден" };
  if (!canEquipSlot(item, slot)) return { inventory: inv, error: "Этот предмет нельзя надеть в этот слот" };
  const next = copy(inv);
  detach(next, itemId);
  next.equipped[slot] = itemId;
  if (slot === "belt") {
    const cap = clampBelt(item.beltCapacity ?? MIN_BELT);
    next.belt = Array.from({ length: cap }, (_, i) => next.belt[i] ?? null);
  }
  return { inventory: next, error: null, log: `Надет предмет «${item.name}» (${SLOTS.find((s) => s.id === slot)!.label})` };
}

export function equipHand(inv: Inventory, itemId: string, set: 0 | 1, hand: Hand): Result {
  const item = findItem(inv, itemId);
  if (!item) return { inventory: inv, error: "Предмет не найден" };
  if (!canEquipHand(item, hand)) return { inventory: inv, error: "Этот предмет нельзя взять в эту руку" };
  const next = copy(inv);
  detach(next, itemId);
  next.weaponSets[set][hand] = itemId;
  return { inventory: next, error: null, log: `Экипировано «${item.name}» (комплект ${set === 0 ? "А" : "Б"}, ${HAND_LABELS[hand].toLowerCase()})` };
}

export function unequip(inv: Inventory, itemId: string): Result {
  const item = findItem(inv, itemId);
  if (!item || !isEquipped(inv, itemId)) return { inventory: inv, error: null };
  const next = copy(inv);
  detach(next, itemId);
  return { inventory: next, error: null, log: `Снят предмет «${item.name}»` };
}

export function swapWeapons(inv: Inventory): Result {
  const next = copy(inv);
  next.activeSet = inv.activeSet === 0 ? 1 : 0;
  return { inventory: next, error: null, log: `Смена оружия: в руках комплект ${next.activeSet === 0 ? "А" : "Б"}` };
}

export function putOnBelt(inv: Inventory, itemId: string, index: number): Result {
  const item = findItem(inv, itemId);
  if (!item) return { inventory: inv, error: "Предмет не найден" };
  if (item.category !== "consumable") return { inventory: inv, error: "На пояс можно положить только расходники" };
  if (index < 0 || index >= inv.belt.length) return { inventory: inv, error: "Нет свободной ячейки пояса" };
  const next = copy(inv);
  detach(next, itemId);
  next.belt[index] = itemId;
  return { inventory: next, error: null, log: `«${item.name}» положен на пояс` };
}

export function upsertItem(inv: Inventory, item: Item): Inventory {
  const next = copy(inv);
  const clean: Item = {
    ...item,
    name: item.name.trim() || "Без названия",
    quantity: Math.max(1, Math.trunc(item.quantity) || 1),
    slot: item.category === "gear" ? item.slot : undefined,
    beltCapacity: item.category === "gear" && item.slot === "belt" ? clampBelt(item.beltCapacity ?? 1) : undefined,
  };
  const old = findItem(next, item.id);
  // Changing what an item is (category/slot) drops it from wherever it was equipped.
  if (old && (old.category !== clean.category || old.slot !== clean.slot || old.beltCapacity !== clean.beltCapacity)) detach(next, item.id);
  next.items = old ? next.items.map((i) => (i.id === item.id ? clean : i)) : [...next.items, clean];
  return next;
}

export function removeItem(inv: Inventory, itemId: string): Inventory {
  const next = copy(inv);
  detach(next, itemId);
  next.items = next.items.filter((i) => i.id !== itemId);
  return next;
}

export function setMoney(inv: Inventory, key: keyof Money, value: number): Inventory {
  const next = copy(inv);
  next.money[key] = Math.max(0, Math.trunc(value) || 0);
  return next;
}

/** Accepts anything (incl. the old array format) and returns a valid inventory. */
export function normalizeInventory(raw: any): Inventory {
  const inv = emptyInventory();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return inv;
  for (const k of Object.keys(inv.money) as (keyof Money)[]) inv.money[k] = Math.max(0, Math.trunc(Number(raw.money?.[k])) || 0);
  if (Array.isArray(raw.items)) {
    inv.items = raw.items
      .filter((i: any) => i && typeof i.id === "string")
      .map((i: any) => ({
        id: i.id,
        name: String(i.name ?? "Без названия"),
        category: (["gear", "consumable", "misc"].includes(i.category) ? i.category : "misc") as ItemCategory,
        slot: i.slot in SLOT_KIND_LABELS ? i.slot : undefined,
        beltCapacity: i.beltCapacity ? clampBelt(Number(i.beltCapacity)) : undefined,
        quantity: Math.max(1, Math.trunc(Number(i.quantity)) || 1),
        description: String(i.description ?? ""),
      }));
  }
  const ids = new Set(inv.items.map((i) => i.id));
  const ref = (v: any) => (typeof v === "string" && ids.has(v) ? v : null);
  for (const s of SLOTS) inv.equipped[s.id] = ref(raw.equipped?.[s.id]);
  if (Array.isArray(raw.weaponSets)) {
    for (const i of [0, 1] as const) inv.weaponSets[i] = { main: ref(raw.weaponSets[i]?.main), off: ref(raw.weaponSets[i]?.off) };
  }
  inv.activeSet = raw.activeSet === 1 ? 1 : 0;
  const beltItem = findItem(inv, inv.equipped.belt);
  if (beltItem) {
    const cap = clampBelt(beltItem.beltCapacity ?? 1);
    inv.belt = Array.from({ length: cap }, (_, i) => ref(Array.isArray(raw.belt) ? raw.belt[i] : null));
  }
  return inv;
}
