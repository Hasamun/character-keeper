import type { ActiveEffect } from "./derived";
import { emptyInventory, type Inventory } from "./inventory";
// Game rules ported 1:1 from the original app_2.py. Pure functions, no UI.

export const PRIMARY_STAT_NAMES = ["Сила", "Ловкость", "Телосложение", "Интеллект", "Мудрость", "Харизма"] as const;
export type PrimaryName = (typeof PRIMARY_STAT_NAMES)[number];

export const PRIMARY_EXP_TABLE: Record<number, number[]> = {
  [-6]: [90, 100, 115, 130, 220],
  [-5]: [78, 86, 100, 115, 190],
  [-4]: [66, 72, 85, 100, 160],
  [-3]: [55, 60, 70, 80, 130],
  [-2]: [45, 48, 55, 60, 100],
  [-1]: [35, 36, 40, 42, 70],
  0: [40, 40, 40, 45, 55],
  1: [50, 50, 55, 55, 80],
  2: [65, 70, 75, 80, 140],
  3: [100, 110, 125, 140, 240],
  4: [170, 190, 220, 250, 460],
  5: [320, 360, 420, 480, 880],
  6: [600, 680, 800, 920, 1750],
  7: [1150, 1300, 1550, 1800, 3500],
  8: [2250, 2550, 3050, 3550, 7000],
  9: [4300, 4900, 5900, 6900, 14500],
};
export const PRIMARY_MIN_LEVEL = -6;
export const PRIMARY_MAX_LEVEL = 10;

export const SECONDARY_GROUPS: Record<PrimaryName, string[]> = {
  Сила: ["Атлетика", "Запугивание (физ.)"],
  Ловкость: ["Акробатика", "Ловкость рук", "Скрытность"],
  Телосложение: ["Выносливость", "Стойкость"],
  Интеллект: ["Магия", "История", "Анализ", "Природа", "Религия"],
  Мудрость: ["Уход за животными", "Проницательность", "Медицина", "Внимательность", "Выживание"],
  Харизма: ["Обман", "Запугивание (морал.)", "Выступление", "Убеждение"],
};
export const SECONDARY_SKILLS = PRIMARY_STAT_NAMES.flatMap((p) => SECONDARY_GROUPS[p]);
export const SKILL_TO_PRIMARY: Record<string, PrimaryName> = Object.fromEntries(
  PRIMARY_STAT_NAMES.flatMap((p) => SECONDARY_GROUPS[p].map((s) => [s, p])),
);

export const SECONDARY_EXP_TABLE: Record<number, number[]> = {
  [-5]: [60, 75, 95],
  [-4]: [50, 65, 85],
  [-3]: [42, 55, 72],
  [-2]: [35, 46, 60],
  [-1]: [28, 38, 50],
  0: [30, 40, 45],
  1: [55, 60, 75],
  2: [90, 105, 130],
  3: [150, 180, 210],
  4: [225, 250, 270],
  5: [300, 330, 370],
  6: [405, 445, 490],
  7: [535, 580, 630],
  8: [685, 735, 795],
  9: [855, 915, 1000],
  10: [1070, 1145, 1250],
};
export const SECONDARY_MIN_LEVEL = -5;
export const SECONDARY_MAX_LEVEL = 10;

export const RACES: Record<string, number> = {
  Человек: 10, Эльф: 8, Гном: 6, Дворф: 13, Гоблин: 5, Драконид: 15, Орк: 14, "Зверо-человек": 11,
};
export const CLASSES: Record<string, number> = {
  Танк: 15, Воин: 11, Боец: 9, Паладин: 13, Следопыт: 8, Плут: 7, Разбойник: 8, Варвар: 12, Монах: 9,
  Священник: 6, Бард: 5, Друид: 7, Маг: 5, Чародей: 6, Физический: 10, Магический: 7, Другой: 8,
};

const HP_BONUS_TABLE: Record<string, Record<number, number>> = {
  Телосложение: { [-5]: -10, [-4]: -8, [-3]: -6, [-2]: -4, [-1]: -2, 0: 0, 1: 2, 2: 5, 3: 9, 4: 14, 5: 20, 6: 27, 7: 35, 8: 44, 9: 54, 10: 65 },
  Стойкость: { [-5]: -5, [-4]: -4, [-3]: -3, [-2]: -2, [-1]: -1, 0: 0, 1: 1, 2: 3, 3: 6, 4: 10, 5: 15, 6: 21, 7: 28, 8: 36, 9: 45, 10: 55 },
  Сила: { [-5]: -8, [-4]: -6, [-3]: -5, [-2]: -3, [-1]: -1, 0: 1, 1: 3, 2: 6, 3: 10, 4: 16, 5: 23, 6: 31, 7: 40, 8: 50, 9: 61, 10: 72 },
};

export const STARTING_EXP = 1000;
export const EDITOR_MIN_LEVEL = -2;
export const EDITOR_MAX_LEVEL = 4;
const LOG_LIMIT = 200;

export interface StatState { level: number; subIndex: number; progress: number }
export interface LogEntry { id: string; at: string; text: string }
export interface Note { id: string; at: string; title: string; text: string }
export interface Character {
  id: string;
  name: string;
  race: string;
  characterClass: string;
  avatar: string;
  primary: Record<string, StatState>;
  secondary: Record<string, StatState>;
  log: LogEntry[];
  notes: Note[];
  inventory: Inventory;
  activeEffects?: ActiveEffect[];
  createdAt: string;
  updatedAt: string;
}

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function newCharacter(): Character {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: "",
    race: Object.keys(RACES)[0]!,
    characterClass: Object.keys(CLASSES)[0]!,
    avatar: "",
    primary: Object.fromEntries(PRIMARY_STAT_NAMES.map((n) => [n, { level: 0, subIndex: 0, progress: 0 }])),
    secondary: Object.fromEntries(SECONDARY_SKILLS.map((n) => [n, { level: 0, subIndex: 0, progress: 0 }])),
    log: [],
    notes: [],
    inventory: emptyInventory(),
    createdAt: now,
    updatedAt: now,
  };
}

/** Python's round(): half to even. */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

export function getHpBonus(stat: string, level: number) {
  return HP_BONUS_TABLE[stat]?.[level] ?? 0;
}

export function getHpComponents(c: Character) {
  const race = RACES[c.race] ?? 0;
  const cls = CLASSES[c.characterClass] ?? 0;
  const con = getHpBonus("Телосложение", c.primary["Телосложение"]?.level ?? 0);
  const sta = getHpBonus("Стойкость", c.secondary["Стойкость"]?.level ?? 0);
  const str = getHpBonus("Сила", c.primary["Сила"]?.level ?? 0);
  return { Раса: race, Класс: cls, Телосложение: con, Стойкость: sta, Сила: str, Итого: race + cls + con + sta + str };
}
export const getHp = (c: Character) => getHpComponents(c).Итого;
export const getArmorClass = (c: Character) => 10 + (c.primary["Ловкость"]?.level ?? 0);
export const getCharacterLevel = (c: Character) =>
  Object.values(c.primary).reduce((s, x) => s + x.level, 0) + Object.values(c.secondary).reduce((s, x) => s + x.level, 0);

export function primaryRequired(level: number, sub: number): number | null {
  const row = PRIMARY_EXP_TABLE[level];
  if (!row || sub < 0 || sub >= row.length) return null;
  return row[sub]!;
}
export function secondaryRequired(level: number, sub: number): number | null {
  const row = SECONDARY_EXP_TABLE[level];
  if (!row || sub < 0 || sub >= row.length) return null;
  return row[sub]!;
}
export function sublevelCost(type: "primary" | "secondary", level: number, sub: number) {
  return (type === "primary" ? primaryRequired(level, sub) : secondaryRequired(level, sub)) ?? 0;
}

function clone(c: Character): Character {
  return {
    ...c,
    primary: Object.fromEntries(Object.entries(c.primary).map(([k, v]) => [k, { ...v }])),
    secondary: Object.fromEntries(Object.entries(c.secondary).map(([k, v]) => [k, { ...v }])),
    log: [...c.log],
  };
}

export function pushLog(c: Character, text: string) {
  c.log.push({ id: uid(), at: new Date().toISOString(), text });
  if (c.log.length > LOG_LIMIT) c.log = c.log.slice(-LOG_LIMIT);
}

function applyPrimary(c: Character, name: string, amount: number): string | null {
  const stat = c.primary[name];
  if (!stat) return "Стата не найдена";
  if (!Number.isInteger(amount) || amount === 0) return "Опыт должен быть ненулевым целым числом";
  let level = stat.level, sub = stat.subIndex, progress = Math.max(0, stat.progress);
  const oldLevel = level, oldSub = sub;

  if (amount > 0) {
    if (level >= PRIMARY_MAX_LEVEL) {
      pushLog(c, `${name} уже на максимальном уровне ${PRIMARY_MAX_LEVEL}, опыт не добавлен`);
      return "Стат на максимальном уровне";
    }
    progress += amount;
    while (true) {
      const needed = primaryRequired(level, sub);
      if (needed === null || needed <= 0 || progress < needed) break;
      progress -= needed;
      sub += 1;
      if (sub >= 5) {
        level += 1;
        sub = 0;
        if (level >= PRIMARY_MAX_LEVEL) { level = PRIMARY_MAX_LEVEL; sub = 0; progress = 0; break; }
      }
    }
  } else {
    progress -= -amount;
    while (progress < 0) {
      if (sub > 0) {
        sub -= 1;
        progress += primaryRequired(level, sub) ?? 0;
      } else {
        if (level <= PRIMARY_MIN_LEVEL) { progress = 0; break; }
        level -= 1;
        sub = 4;
        progress += primaryRequired(level, sub) ?? 0;
      }
    }
    progress = Math.max(0, progress);
  }
  c.primary[name] = { level, subIndex: sub, progress };
  const action = amount > 0 ? "добавлено" : "убрано";
  if (level !== oldLevel || sub !== oldSub) {
    pushLog(c, `${name}: ${action} ${Math.abs(amount)} опыта, уровень ${oldLevel}→${level}, подуровень ${oldSub + 1}→${sub + 1}`);
  } else {
    pushLog(c, `${name}: ${action} ${Math.abs(amount)} опыта, уровень остался ${level}, подуровень ${sub + 1}`);
  }
  return null;
}

function applySecondary(c: Character, name: string, amount: number): string | null {
  const stat = c.secondary[name];
  if (!stat) return "Навык не найден";
  if (!Number.isInteger(amount) || amount === 0) return "Опыт должен быть ненулевым целым числом";
  const oldLevel = stat.level, oldSub = stat.subIndex;
  let level = oldLevel, sub = oldSub, progress = Math.max(0, stat.progress);

  if (amount > 0) {
    progress += amount;
    while (true) {
      const needed = secondaryRequired(level, sub);
      if (needed === null || needed <= 0 || progress < needed) break;
      if (level === SECONDARY_MAX_LEVEL) {
        if (sub === 2) { progress = needed; break; }
        progress -= needed;
        sub += 1;
        continue;
      }
      progress -= needed;
      sub += 1;
      if (sub >= 3) {
        level += 1;
        sub = 0;
        if (level > SECONDARY_MAX_LEVEL) {
          level = SECONDARY_MAX_LEVEL; sub = 2;
          progress = secondaryRequired(level, sub) ?? 0;
          break;
        }
      }
    }
  } else {
    progress -= -amount;
    while (progress < 0) {
      if (sub > 0) {
        sub -= 1;
        progress += secondaryRequired(level, sub) ?? 0;
      } else {
        if (level <= SECONDARY_MIN_LEVEL) { progress = 0; break; }
        level -= 1;
        sub = 2;
        progress += secondaryRequired(level, sub) ?? 0;
      }
    }
    progress = Math.max(0, progress);
  }
  c.secondary[name] = { level, subIndex: sub, progress };

  if (level !== oldLevel) {
    const primary = SKILL_TO_PRIMARY[name]!;
    const from = Math.min(level, oldLevel), to = Math.max(level, oldLevel);
    for (let lvl = from; lvl < to; lvl++) {
      const row = SECONDARY_EXP_TABLE[lvl];
      if (!row) continue;
      const bonus = pyRound(row.reduce((a, b) => a + b, 0) / 3);
      applyPrimary(c, primary, level > oldLevel ? bonus : -bonus);
    }
  }

  const action = amount > 0 ? "добавлено" : "убрано";
  if (level !== oldLevel || sub !== oldSub) {
    pushLog(c, `${name}: ${action} ${Math.abs(amount)} опыта, уровень ${oldLevel}→${level}, подуровень ${oldSub + 1}→${sub + 1}`);
  } else {
    pushLog(c, `${name}: ${action} ${Math.abs(amount)} опыта, уровень остался ${level}, подуровень ${sub + 1}`);
  }
  return null;
}

export function addPrimaryExp(c: Character, name: string, amount: number) {
  const next = clone(c);
  const error = applyPrimary(next, name, amount);
  return { character: next, error };
}
export function addSecondaryExp(c: Character, name: string, amount: number) {
  const next = clone(c);
  const error = applySecondary(next, name, amount);
  return { character: next, error };
}

/** Net exp a stat state costs relative to (0, 0). Negative = refund for going below zero. */
export function stateCost(type: "primary" | "secondary", level: number, sub: number): number {
  const table = type === "primary" ? PRIMARY_EXP_TABLE : SECONDARY_EXP_TABLE;
  const row = (l: number) => table[l] ?? [];
  let total = 0;
  if (level >= 0) {
    for (let l = 0; l < level; l++) total += row(l).reduce((a, b) => a + b, 0);
    total += row(level).slice(0, sub).reduce((a, b) => a + b, 0);
  } else {
    total -= row(level).slice(sub).reduce((a, b) => a + b, 0);
    for (let l = level + 1; l < 0; l++) total -= row(l).reduce((a, b) => a + b, 0);
  }
  return total;
}

/** Free starting exp, always derived from current levels (cannot drift). */
export function computeFreeExp(c: Character): number {
  let spent = 0;
  for (const s of Object.values(c.primary)) spent += stateCost("primary", s.level, s.subIndex);
  for (const s of Object.values(c.secondary)) spent += stateCost("secondary", s.level, s.subIndex);
  return STARTING_EXP - spent;
}

/** Starting editor step (+1/-1 sublevel). Only level limits apply; free exp may go negative. */
export function editorAdjust(
  c: Character, type: "primary" | "secondary", name: string, direction: 1 | -1,
): { character: Character; error: string | null } {
  const maxSub = type === "primary" ? 4 : 2;
  const next = clone(c);
  const group = type === "primary" ? next.primary : next.secondary;
  let { level, subIndex: sub } = group[name]!;
  if (direction > 0) {
    if (level >= EDITOR_MAX_LEVEL) return { character: c, error: `${name} уже на максимальном уровне ${EDITOR_MAX_LEVEL}` };
    sub += 1;
    if (sub > maxSub) { level += 1; sub = 0; }
  } else {
    if (level <= EDITOR_MIN_LEVEL && sub === 0) return { character: c, error: `${name} уже на минимальном уровне` };
    if (sub > 0) sub -= 1;
    else { level -= 1; sub = maxSub; }
  }
  group[name] = { level, subIndex: sub, progress: 0 };
  return { character: next, error: null };
}
