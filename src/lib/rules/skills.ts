import { normalizeEffect, type Effect } from './items';

export type SkillType = 'active' | 'passive';
export type PatchOrigin = 'empty' | 'manual' | 'ai';
export type SkillOp =
  | { op: 'add'; effect: Effect }
  | { op: 'update'; effect: Effect }
  | { op: 'remove'; effectId: string };
export interface SkillLevelPatch { ops: SkillOp[]; exhaustionCost?: number | undefined; note?: string | undefined; origin: PatchOrigin }
export interface SkillDefinition { name: string; type: SkillType; description: string; levels: SkillLevelPatch[] }
export interface SkillHistoryEntry { id: string; at: string; text: string }
export interface SkillInstance {
  id: string;
  templateId?: string | undefined;
  templateVersion?: number | undefined;
  definition: SkillDefinition;
  level: number;
  xp: number;
  draft: boolean;
  history: SkillHistoryEntry[];
}

export const SKILL_MAX_LEVEL = 25;
export const SKILL_RANKS = ['Новичок', 'Любитель', 'Специалист', 'Эксперт', 'Мастер'] as const;
/** Full source tables (25 values each). Index i = transition from level i+1 to i+2; the 25th value is kept but unused. */
export const ACTIVE_XP_TABLE = [5, 6, 7, 8, 10, 8, 10, 12, 14, 20, 12, 15, 18, 21, 25, 18, 22, 26, 30, 35, 30, 35, 40, 45, 55] as const;
export const PASSIVE_XP_TABLE = [4, 4, 6, 6, 10, 8, 8, 10, 10, 14, 12, 12, 14, 14, 18, 16, 16, 18, 18, 22, 20, 20, 22, 22, 26] as const;
export const EXHAUSTION_CONFIRM = 500;

const clampLevel = (l: number) => Math.max(1, Math.min(SKILL_MAX_LEVEL, Math.trunc(l) || 1));
export const rankOf = (level: number) => SKILL_RANKS[Math.floor((clampLevel(level) - 1) / 5)]!;
export const levelInRank = (level: number) => ((clampLevel(level) - 1) % 5) + 1;

/** XP needed to go from `level` to `level + 1`; null at max level. */
export function xpToNext(type: SkillType, level: number): number | null {
  const l = clampLevel(level);
  if (l >= SKILL_MAX_LEVEL) return null;
  return (type === 'active' ? ACTIVE_XP_TABLE : PASSIVE_XP_TABLE)[l - 1]!;
}

/** Adds (or removes) XP with carry-over; level stops at 25 and XP never goes below 0 of level 1. */
export function addSkillXp(type: SkillType, level: number, xp: number, delta: number) {
  let l = clampLevel(level), x = Math.max(0, Math.trunc(xp)) + Math.trunc(delta);
  while (x < 0 && l > 1) { l -= 1; x += xpToNext(type, l)!; }
  if (x < 0) x = 0;
  for (let need = xpToNext(type, l); need != null && x >= need; need = xpToNext(type, l)) { x -= need; l += 1; }
  if (l >= SKILL_MAX_LEVEL) x = 0;
  return { level: l, xp: x, maxed: l >= SKILL_MAX_LEVEL };
}

export const emptyPatch = (): SkillLevelPatch => ({ ops: [], origin: 'empty' });
export function newSkillDefinition(type: SkillType = 'active'): SkillDefinition {
  return { name: '', type, description: '', levels: Array.from({ length: SKILL_MAX_LEVEL }, emptyPatch) };
}

/** Applies patches from level 1 to `level`, returning the full effect set of that level. */
export function resolveLevel(def: SkillDefinition, level: number): Effect[] {
  const map = new Map<string, Effect>();
  for (let i = 0; i < clampLevel(level); i++) {
    for (const op of def.levels[i]?.ops ?? []) {
      if (op.op === 'remove') map.delete(op.effectId);
      else if (op.op === 'add' || map.has(op.effect.id)) map.set(op.effect.id, { ...op.effect });
    }
  }
  return [...map.values()];
}

/** Exhaustion cost for an active skill at `level`, inherited from the latest defined level. Passive skills cost 0. */
export function costAt(def: SkillDefinition, level: number): number {
  if (def.type === 'passive') return 0;
  let cost = 0;
  for (let i = 0; i < clampLevel(level); i++) { const c = def.levels[i]?.exhaustionCost; if (c != null) cost = c; }
  return cost;
}

export const EXHAUSTION_BANDS = [[0, 99], [100, 199], [200, 299], [300, 399], [400, 499], [500, Infinity]] as const;
export function exhaustionBand(value: number) {
  const v = Math.max(0, Math.trunc(value));
  const i = EXHAUSTION_BANDS.findIndex(([a, b]) => v >= a && v <= b);
  const [a, b] = EXHAUSTION_BANDS[i]!;
  return { index: i, label: b === Infinity ? `${a}+` : `${a}–${b}` };
}
export const needsExhaustionConfirm = (current: number, cost: number) => current >= EXHAUSTION_CONFIRM || current + cost >= EXHAUSTION_CONFIRM;

export interface LevelDiff { level: number; added: Effect[]; removed: Effect[]; changed: { before: Effect; after: Effect }[]; costBefore: number; costAfter: number }
/** Levels whose resolved effects or cost differ between two definitions. */
export function diffLevels(before: SkillDefinition, after: SkillDefinition): LevelDiff[] {
  const out: LevelDiff[] = [];
  for (let l = 1; l <= SKILL_MAX_LEVEL; l++) {
    const a = new Map(resolveLevel(before, l).map(e => [e.id, e])), b = new Map(resolveLevel(after, l).map(e => [e.id, e]));
    const added = [...b.values()].filter(e => !a.has(e.id)), removed = [...a.values()].filter(e => !b.has(e.id));
    const changed = [...b.values()].flatMap(e => { const p = a.get(e.id); return p && JSON.stringify(p) !== JSON.stringify(e) ? [{ before: p, after: e }] : []; });
    const costBefore = costAt(before, l), costAfter = costAt(after, l);
    if (added.length || removed.length || changed.length || costBefore !== costAfter) out.push({ level: l, added, removed, changed, costBefore, costAfter });
  }
  return out;
}

/** Copy for another character: no history; teach_current keeps level with 0 XP, otherwise level 1. */
export function copySkillFor(s: SkillInstance, mode: 'copy' | 'teach_novice' | 'teach_current', newId: string): SkillInstance {
  return { id: newId, templateId: s.templateId, templateVersion: s.templateVersion, definition: structuredClone(s.definition), level: mode === 'teach_current' ? s.level : 1, xp: 0, draft: s.draft, history: [] };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
function normalizeOp(raw: any): SkillOp | null {
  if (raw?.op === 'remove') return typeof raw.effectId === 'string' ? { op: 'remove', effectId: raw.effectId } : null;
  if (raw?.op !== 'add' && raw?.op !== 'update') return null;
  const effect = normalizeEffect(raw.effect);
  return effect ? { op: raw.op, effect } : null;
}
function normalizePatch(raw: any): SkillLevelPatch {
  const ops = Array.isArray(raw?.ops) ? raw.ops.map(normalizeOp).filter(Boolean) as SkillOp[] : [];
  const cost = Number(raw?.exhaustionCost);
  const origin: PatchOrigin = raw?.origin === 'ai' || raw?.origin === 'manual' ? raw.origin : ops.length || Number.isFinite(cost) ? 'manual' : 'empty';
  return { ops, origin, ...(raw?.exhaustionCost != null && Number.isFinite(cost) ? { exhaustionCost: Math.max(0, Math.trunc(cost)) } : {}), ...(str(raw?.note) ? { note: str(raw.note) } : {}) };
}
export function normalizeSkillDefinition(raw: any): SkillDefinition {
  const levels = Array.from({ length: SKILL_MAX_LEVEL }, (_, i) => normalizePatch(Array.isArray(raw?.levels) ? raw.levels[i] : null));
  return { name: str(raw?.name).trim() || 'Без названия', type: raw?.type === 'passive' ? 'passive' : 'active', description: str(raw?.description), levels };
}
export function normalizeSkills(raw: unknown): SkillInstance[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((s: any) => {
    if (!s || typeof s.id !== 'string' || seen.has(s.id)) return [];
    seen.add(s.id);
    const definition = normalizeSkillDefinition(s.definition);
    const r = addSkillXp(definition.type, Number(s.level) || 1, Number(s.xp) || 0, 0);
    const v = Number(s.templateVersion);
    return [{ id: s.id, ...(typeof s.templateId === 'string' ? { templateId: s.templateId } : {}), ...(Number.isFinite(v) ? { templateVersion: v } : {}), definition, level: r.level, xp: r.xp, draft: s.draft === true,
      history: Array.isArray(s.history) ? s.history.filter((h: any) => h && typeof h.text === 'string').map((h: any) => ({ id: String(h.id ?? ''), at: String(h.at ?? ''), text: h.text })) : [] }];
  });
}
export const normalizeExhaustion = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
