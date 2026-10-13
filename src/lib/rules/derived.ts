import { getArmorClass, getHp, PRIMARY_STAT_NAMES, SECONDARY_SKILLS, pushLog, uid, type Character } from './index';
import { canEquipHand, canEquipSlot, equipHand, equipSlot, findItem, removeItem, SLOTS, type Item, type SlotId, type Hand } from './inventory';
import { normalizeEffect, effectLabel, withHistory, type Effect } from './items';

export interface ActiveEffect { id: string; sourceItemId: string; sourceName: string; effect: Effect; equipmentBound: boolean }
export function normalizeActiveEffects(raw: unknown): ActiveEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(a => {
    const effect = normalizeEffect(a?.effect);
    return effect && typeof a.id === 'string' && typeof a.sourceItemId === 'string' ? [{ id: a.id, sourceItemId: a.sourceItemId, sourceName: String(a.sourceName ?? 'Эффект'), effect, equipmentBound: a.equipmentBound === true }] : [];
  });
}
export function wornItems(c: Character): Item[] {
  const set = c.inventory.weaponSets[c.inventory.activeSet];
  const ids = new Set([...Object.values(c.inventory.equipped), set.main, set.off]);
  return c.inventory.items.filter(i => ids.has(i.id) && i.category === 'gear');
}
export const automatic = (e: Effect) => e.automation === 'auto' && !e.condition && e.charges == null && !e.duration;
export function deriveCharacter(c: Character) {
  const primary = Object.fromEntries(PRIMARY_STAT_NAMES.map(n => [n, c.primary[n]?.level ?? 0]));
  const secondary = Object.fromEntries(SECONDARY_SKILLS.map(n => [n, c.secondary[n]?.level ?? 0]));
  const worn = wornItems(c);
  const sources = worn.flatMap(i => (i.effects ?? []).filter(automatic).map(effect => ({ source: i.name, effect })));
  const boundKeys = new Set<string>();
  for (const a of c.activeEffects ?? []) {
    if (a.equipmentBound) {
      const item = worn.find(i => i.id === a.sourceItemId);
      const effect = item?.effects?.find(e => e.id === a.effect.id);
      const key = `${a.sourceItemId}:${a.effect.id}`;
      if (!effect || automatic(effect) || boundKeys.has(key)) continue;
      boundKeys.add(key);
      sources.push({ source: item?.name ?? a.sourceName, effect });
    } else sources.push({ source: a.sourceName, effect: a.effect });
  }
  let acBonus = worn.reduce((sum, i) => sum + (i.armor?.ac ?? 0), 0), attackBonus = 0, damageBonus = 0;
  const resistances = new Set<string>(), vulnerabilities = new Set<string>(), extraDamage: string[] = [], descriptions: string[] = [], warnings: string[] = [];
  for (const { source, effect: e } of sources) {
    if (e.kind === 'stat' || e.kind === 'skill') {
      const table = e.kind === 'stat' ? primary : secondary;
      if (Object.hasOwn(table, e.target)) table[e.target] = (table[e.target] ?? 0) + e.value;
      else warnings.push(`${source}: неизвестная цель «${e.target}»`);
    } else if (e.kind === 'ac') acBonus += e.value;
    else if (e.kind === 'attack') { if (!e.target) attackBonus += e.value; }
    else if (e.kind === 'damage') { if (!e.target) damageBonus += e.value; }
    else if (e.kind === 'resistance') resistances.add(e.damageType || e.target);
    else if (e.kind === 'vulnerability') vulnerabilities.add(e.damageType || e.target);
    else if (e.kind === 'extra_damage' && !e.condition) extraDamage.push(effectLabel(e));
    else descriptions.push(`${source}: ${effectLabel(e)}`);
  }
  const effective: Character = { ...c, primary: Object.fromEntries(Object.entries(c.primary).map(([n, s]) => [n, { ...s, level: primary[n] ?? s.level }])), secondary: Object.fromEntries(Object.entries(c.secondary).map(([n, s]) => [n, { ...s, level: secondary[n] ?? s.level }])) };
  const hpUnsupported = [['Сила', primary['Сила']], ['Телосложение', primary['Телосложение']], ['Стойкость', secondary['Стойкость']]].some(([, v]) => typeof v !== 'number' || v < -5 || v > 10);
  if (hpUnsupported) warnings.push('HP: итоговые значения выходят за пределы таблицы −5…10.');
  const weapons = (['main', 'off'] as const).flatMap(hand => {
    const i = findItem(c.inventory, c.inventory.weaponSets[c.inventory.activeSet][hand]);
    const w = i?.weapon;
    if (!i || !w) return [];
    const str = primary['Сила'] ?? 0, dex = primary['Ловкость'] ?? 0;
    const stat = w.attackMode === 'str' ? str : w.attackMode === 'dex' ? dex : w.attackMode === 'best' ? Math.max(str, dex) : w.attackMode === 'sum' ? str + dex : 0;
    const scoped = (kind: 'attack' | 'damage') => sources.filter(s => s.effect.kind === kind && s.effect.target === i.id).reduce((sum, s) => sum + s.effect.value, 0);
    return [{ id: i.id, name: i.name, hand, attack: stat + w.attackBonus + attackBonus + scoped('attack'), damage: w.damage || '—', damageType: w.damageType, damageBonus: damageBonus + scoped('damage') }];
  });
  return { primary, secondary, hp: hpUnsupported ? null : getHp(effective), baseHp: getHp(c), ac: getArmorClass(effective) + acBonus, baseAc: getArmorClass(c), attackBonus, damageBonus, weapons, resistances: [...resistances].filter(Boolean), vulnerabilities: [...vulnerabilities].filter(Boolean), extraDamage, descriptions, warnings, sources: [...worn.filter(i => i.armor?.ac).map(i => `${i.name}: КБ ${i.armor?.ac}`), ...sources.map(s => `${s.source}: ${effectLabel(s.effect)}`)] };
}
export function activateEquipmentEffect(c: Character, itemId: string, effectId: string): Character {
  const i = wornItems(c).find(i => i.id === itemId), e = i?.effects?.find(e => e.id === effectId);
  if (!i || !e || automatic(e) || e.charges != null || (c.activeEffects ?? []).some(a => a.equipmentBound && a.sourceItemId === itemId && a.effect.id === effectId)) return c;
  const next = { ...c, log: [...c.log], activeEffects: [...(c.activeEffects ?? []), { id: uid(), sourceItemId: i.id, sourceName: i.name, effect: { ...e }, equipmentBound: true }] };
  pushLog(next, `Включён эффект «${effectLabel(e)}» (${i.name})`);
  return next;
}
export function endEffect(c: Character, id: string): Character {
  const a = c.activeEffects?.find(a => a.id === id);
  if (!a) return c;
  const next = { ...c, log: [...c.log], activeEffects: (c.activeEffects ?? []).filter(a => a.id !== id) };
  pushLog(next, `Завершён эффект «${effectLabel(a.effect)}» (${a.sourceName})`);
  return next;
}
export function useItem(c: Character, itemId: string, effectId?: string): { character: Character; error: string | null } {
  const i = findItem(c.inventory, itemId), e = i?.effects?.find(e => e.id === effectId);
  if (!i) return { character: c, error: 'Предмет не найден' };
  if (effectId && (!e || e.charges == null)) return { character: c, error: 'У эффекта нет зарядов' };
  if (!effectId && i.category !== 'consumable') return { character: c, error: 'Это не расходник' };
  if (e && (e.remainingCharges ?? e.charges ?? 0) <= 0) return { character: c, error: 'Заряды закончились' };
  if (i.quantity <= 0) return { character: c, error: 'Предмет закончился' };
  if (e && i.category === 'gear' && !wornItems(c).some(w => w.id === i.id)) return { character: c, error: 'Сначала наденьте предмет' };
  const used = e ? withHistory({ ...i, effects: (i.effects ?? []).map(x => x.id === e.id ? { ...x, remainingCharges: (x.remainingCharges ?? x.charges ?? 0) - 1 } : x) }, `Потрачен заряд: ${effectLabel(e)}`) : withHistory({ ...i, quantity: i.quantity - 1 }, 'Использована 1 шт.');
  const inventory = used.quantity === 0 ? removeItem(c.inventory, i.id) : { ...c.inventory, items: c.inventory.items.map(x => x.id === i.id ? used : x) };
  const effects = e ? [e] : (i.effects ?? []).filter(x => x.charges == null);
  const next: Character = { ...c, inventory, log: [...c.log], activeEffects: [...(c.activeEffects ?? []), ...effects.map(effect => ({ id: uid(), sourceItemId: i.id, sourceName: i.name, effect: { ...effect }, equipmentBound: i.category === 'gear' }))] };
  pushLog(next, `Использован «${i.name}»: ${e ? `1 заряд (${effectLabel(e)})` : '1 шт.'}`);
  return { character: next, error: null };
}
export function reconcileEffects(c: Character): Character {
  const worn = new Set(wornItems(c).map(i => i.id));
  return { ...c, activeEffects: (c.activeEffects ?? []).filter(a => !a.equipmentBound || worn.has(a.sourceItemId)) };
}
export type CompareSlot = SlotId | Hand;
export function comparable(a: Item, b: Item) { return a.id !== b.id && a.category === b.category && a.slot === b.slot && (a.category === 'gear' || a.subtype === b.subtype); }
export function comparisonSlots(i: Item): CompareSlot[] {
  return [...SLOTS.filter(s => canEquipSlot(i, s.id)).map(s => s.id), ...(['main', 'off'] as const).filter(h => canEquipHand(i, h))];
}
export function compareReplacement(c: Character, firstId: string, secondId: string, slot: CompareSlot) {
  const first = findItem(c.inventory, firstId), second = findItem(c.inventory, secondId);
  if (!first || !second || !comparable(first, second) || !comparisonSlots(first).includes(slot) || !comparisonSlots(second).includes(slot)) return null;
  const apply = (i: Item) => {
    const r = slot === 'main' || slot === 'off' ? equipHand(c.inventory, i.id, c.inventory.activeSet, slot) : equipSlot(c.inventory, i.id, slot);
    // Conditional equipment effects do not transfer to a comparison candidate.
    return deriveCharacter({ ...c, inventory: r.inventory, activeEffects: (c.activeEffects ?? []).filter(a => !a.equipmentBound || a.sourceItemId !== firstId && a.sourceItemId !== secondId) });
  };
  return { first: apply(first), second: apply(second) };
}
