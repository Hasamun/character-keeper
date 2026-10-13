// Extended item model: ranks, subtypes, weapon/armor stats, requirements, effects. Pure helpers only.
import { PRIMARY_STAT_NAMES, type Character } from "./index";
import type { Inventory, Item, ItemSlotKind } from "./inventory";

export const RANKS = ["F", "E", "D", "C", "B", "A", "S"] as const;
export type Rank = (typeof RANKS)[number];
export const RANK_LABELS: Record<Rank, string> = { F: "F", E: "E", D: "D", C: "C", B: "B", A: "A", S: "S" };

export const SUBTYPES: Partial<Record<ItemSlotKind | "consumable" | "misc", string[]>> = {
  weapon: ["Меч", "Топор", "Булава", "Молот", "Кинжал", "Копьё", "Посох", "Лук", "Арбалет", "Метательное", "Кастет", "Прочее"],
  offhand: ["Щит", "Баклер", "Фокусировка", "Кинжал для левой руки"],
  chest: ["Лёгкая броня", "Средняя броня", "Тяжёлая броня", "Одежда"],
  consumable: ["Зелье", "Бомба", "Яд", "Свиток", "Еда", "Боеприпасы", "Прочее"],
  misc: ["Материал", "Квестовый", "Инструмент", "Ценность", "Прочее"],
};

export const DAMAGE_TYPES = ["Рубящий", "Колющий", "Дробящий", "Огненный", "Холодный", "Электрический", "Кислотный", "Ядовитый", "Некротический", "Светлый", "Психический", "Силовой"] as const;

export type AttackMode = "fixed" | "str" | "dex" | "best" | "sum";
export const ATTACK_MODE_LABELS: Record<AttackMode, string> = {
  fixed: "Фиксированный", str: "От Силы", dex: "От Ловкости", best: "Лучшее из Силы и Ловкости", sum: "Сила + Ловкость",
};

export interface WeaponStats { damage: string; attackBonus: number; damageType: string; attackMode: AttackMode; twoHanded: boolean }
export interface ArmorStats { ac: number; armorType: string }
export interface Requirement { stat: (typeof PRIMARY_STAT_NAMES)[number]; min: number }

export type EffectKind = "stat" | "skill" | "ac" | "attack" | "damage" | "resistance" | "vulnerability" | "extra_damage" | "condition" | "ability";
export const EFFECT_KIND_LABELS: Record<EffectKind, string> = {
  stat: "Бонус к характеристике", skill: "Бонус к навыку", ac: "Бонус к КБ", attack: "Бонус к атаке", damage: "Бонус к урону",
  resistance: "Сопротивление", vulnerability: "Уязвимость", extra_damage: "Доп. урон", condition: "Состояние", ability: "Способность",
};
export type Automation = "auto" | "confirm" | "manual";
export interface Effect {
  id: string;
  kind: EffectKind;
  target: string;
  value: number;
  damageType?: string | undefined;
  condition?: string | undefined;
  duration?: string | undefined;
  charges?: number | undefined;
  description?: string | undefined;
  automation: Automation;
}
export interface ItemHistoryEntry { at: string; text: string }

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const opt = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export function normalizeEffect(raw: any): Effect | null {
  if (!raw || typeof raw !== "object" || !(raw.kind in EFFECT_KIND_LABELS)) return null;
  return {
    id: str(raw.id) || Math.random().toString(36).slice(2),
    kind: raw.kind,
    target: str(raw.target),
    value: Math.trunc(num(raw.value)),
    damageType: opt(raw.damageType),
    condition: opt(raw.condition),
    duration: opt(raw.duration),
    charges: raw.charges == null || raw.charges === "" ? undefined : Math.max(0, Math.trunc(num(raw.charges))),
    description: opt(raw.description),
    automation: ["auto", "confirm", "manual"].includes(raw.automation) ? raw.automation : "auto",
  };
}

/** Normalizes the extended (optional) part of an item; old items stay valid. */
export function normalizeItemExtras(raw: any): Partial<Item> {
  const out: Partial<Item> = {};
  if (RANKS.includes(raw?.rank)) out.rank = raw.rank;
  for (const k of ["subtype", "image", "thumb", "lore", "author", "source", "notes", "createdAt"] as const) {
    const v = opt(raw?.[k]);
    if (v) out[k] = v;
  }
  if (raw?.weapon && typeof raw.weapon === "object") {
    const w = raw.weapon;
    out.weapon = {
      damage: str(w.damage), attackBonus: Math.trunc(num(w.attackBonus)), damageType: str(w.damageType),
      attackMode: w.attackMode in ATTACK_MODE_LABELS ? w.attackMode : "fixed", twoHanded: !!w.twoHanded,
    };
  }
  if (raw?.armor && typeof raw.armor === "object") out.armor = { ac: Math.trunc(num(raw.armor.ac)), armorType: str(raw.armor.armorType) };
  if (raw?.weight != null && raw.weight !== "") out.weight = Math.max(0, num(raw.weight));
  if (raw?.price != null && raw.price !== "") out.price = Math.max(0, Math.trunc(num(raw.price)));
  if (Array.isArray(raw?.requirements)) {
    out.requirements = raw.requirements
      .filter((r: any) => PRIMARY_STAT_NAMES.includes(r?.stat))
      .map((r: any) => ({ stat: r.stat, min: Math.trunc(num(r.min)) }));
  }
  if (Array.isArray(raw?.effects)) out.effects = raw.effects.map(normalizeEffect).filter(Boolean) as Effect[];
  if (Array.isArray(raw?.history)) out.history = raw.history.map((h: any) => ({ at: str(h?.at), text: str(h?.text) })).slice(-100);
  return out;
}

export const itemRank = (i: Item): Rank => i.rank ?? "F";

/** Key equal for consumables that are fully identical apart from id/quantity/history. */
export function stackKey(i: Item): string | null {
  if (i.category !== "consumable") return null;
  const { id: _id, quantity: _q, history: _h, createdAt: _c, notes: _n, ...rest } = i;
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted)
      : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter((k) => (v as any)[k] !== undefined && k !== "id").map((k) => [k, sorted((v as any)[k])]))
      : v;
  return JSON.stringify(sorted(rest));
}

export interface ItemWarning { kind: "two_handed" | "requirement"; text: string }

export function unmetRequirements(c: Character, i: Item) {
  return (i.requirements ?? [])
    .map((r) => ({ ...r, have: c.primary[r.stat]?.level ?? 0 }))
    .filter((r) => r.have < r.min);
}

/** Warnings for the current equipment. They never block equipping. */
export function equipmentWarnings(c: Character, inv: Inventory): ItemWarning[] {
  const out: ItemWarning[] = [];
  const byId = (id: string | null) => (id ? inv.items.find((x) => x.id === id) : undefined);
  inv.weaponSets.forEach((s, idx) => {
    const main = byId(s.main), off = byId(s.off);
    const two = [main, off].find((x) => x?.weapon?.twoHanded);
    if (two && main && off) out.push({ kind: "two_handed", text: `Комплект ${idx === 0 ? "А" : "Б"}: «${two.name}» двуручное, но вторая рука занята («${(two === main ? off : main).name}»).` });
  });
  const worn = new Set<string>([
    ...Object.values(inv.equipped).filter(Boolean) as string[],
    ...([inv.weaponSets[inv.activeSet].main, inv.weaponSets[inv.activeSet].off].filter(Boolean) as string[]),
  ]);
  for (const id of worn) {
    const it = byId(id);
    if (!it) continue;
    for (const r of unmetRequirements(c, it)) {
      out.push({ kind: "requirement", text: `«${it.name}»: нужна ${r.stat} ${r.min}, у героя ${r.have}. Штраф ${r.have - r.min} к броскам с этим предметом.` });
    }
  }
  return out;
}

/** Main stat shown on a card: damage / attack for weapons, AC for armor. */
export function mainStat(i: Item): string | null {
  if (i.weapon && (i.weapon.damage || i.weapon.attackBonus)) {
    const atk = i.weapon.attackBonus ? ` · ${i.weapon.attackBonus > 0 ? "+" : ""}${i.weapon.attackBonus} атк` : "";
    return `${i.weapon.damage || "—"}${atk}`;
  }
  if (i.armor && i.armor.ac) return `КБ ${i.armor.ac > 0 ? "+" : ""}${i.armor.ac}`;
  return null;
}

export function effectLabel(e: Effect): string {
  const sign = e.value > 0 ? "+" : "";
  switch (e.kind) {
    case "stat": case "skill": return `${e.target || "?"} ${sign}${e.value}`;
    case "ac": return `КБ ${sign}${e.value}`;
    case "attack": return `Атака ${sign}${e.value}`;
    case "damage": return `Урон ${sign}${e.value}`;
    case "resistance": return `Сопр. ${e.damageType ?? e.target}`;
    case "vulnerability": return `Уязв. ${e.damageType ?? e.target}`;
    case "extra_damage": return `+${e.target || e.value} ${e.damageType ?? ""}`.trim();
    case "condition": return e.target || "Состояние";
    case "ability": return e.target || "Способность";
  }
}

export const withHistory = (i: Item, text: string): Item => ({
  ...i, history: [...(i.history ?? []), { at: new Date().toISOString(), text }].slice(-100),
});
