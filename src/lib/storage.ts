import {
  CLASSES, PRIMARY_MAX_LEVEL, PRIMARY_MIN_LEVEL, PRIMARY_STAT_NAMES, RACES, SECONDARY_MAX_LEVEL,
  SECONDARY_MIN_LEVEL, SECONDARY_SKILLS, newCharacter, uid, type Character, type StatState,
} from "./rules";
import { normalizeInventory } from "./rules/inventory";

import { normalizeActiveEffects } from "./rules/derived";
import { normalizeExhaustion, normalizeSkills } from "./rules/skills";

const KEY = "rpg-tracker:characters:v1";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function readStat(raw: any, min: number, max: number, maxSub: number): StatState | null {
  if (!raw || typeof raw !== "object") return null;
  const level = Number(raw.level ?? 0), sub = Number(raw.subIndex ?? raw.sub_index ?? 0), progress = Number(raw.progress ?? 0);
  if (![level, sub, progress].every(Number.isFinite)) return null;
  return { level: clamp(Math.trunc(level), min, max), subIndex: clamp(Math.trunc(sub), 0, maxSub), progress: Math.max(0, Math.trunc(progress)) };
}

/** Validates both this app's format and the original Python JSON format. */
export function normalizeCharacter(data: any): Character {
  if (!data || typeof data !== "object") throw new Error("Некорректный формат данных персонажа");
  const c = newCharacter();
  if (typeof data.id === "string") c.id = data.id;
  c.name = String(data.name ?? "").trim() || "Без имени";
  c.race = String(data.race ?? "");
  if (!(c.race in RACES)) c.race = Object.keys(RACES)[0]!;
  c.characterClass = String(data.characterClass ?? data.class ?? "");
  if (!(c.characterClass in CLASSES)) c.characterClass = Object.keys(CLASSES)[0]!;
  const avatar = data.avatar ?? data.icon ?? "";
  c.avatar = typeof avatar === "string" && avatar.startsWith("data:image/") ? avatar : "";
  for (const n of PRIMARY_STAT_NAMES) {
    const s = readStat(data.primary?.[n], PRIMARY_MIN_LEVEL, PRIMARY_MAX_LEVEL, 4);
    if (s) c.primary[n] = s;
  }
  for (const n of SECONDARY_SKILLS) {
    const s = readStat(data.secondary?.[n], SECONDARY_MIN_LEVEL, SECONDARY_MAX_LEVEL, 2);
    if (s) c.secondary[n] = s;
  }
  const now = new Date().toISOString();
  if (Array.isArray(data.log)) {
    c.log = data.log.map((x: any) =>
      typeof x === "string" ? { id: uid(), at: now, text: x } : { id: String(x?.id ?? uid()), at: String(x?.at ?? now), text: String(x?.text ?? "") },
    );
  }
  if (Array.isArray(data.notes)) {
    c.notes = data.notes.map((x: any) =>
      typeof x === "string"
        ? { id: uid(), at: now, title: "", text: x }
        : { id: String(x?.id ?? uid()), at: String(x?.at ?? now), title: String(x?.title ?? ""), text: String(x?.text ?? "") },
    );
  }
  c.inventory = normalizeInventory(data.inventory);
  c.activeEffects = normalizeActiveEffects(data.activeEffects);
  c.skills = normalizeSkills(data.skills);
  c.exhaustion = normalizeExhaustion(data.exhaustion);
  c.createdAt = String(data.createdAt ?? now);
  c.updatedAt = String(data.updatedAt ?? now);
  return c;
}

export function loadAll(): Character[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((x) => { try { return [normalizeCharacter(x)]; } catch { return []; } });
  } catch {
    return [];
  }
}

/** Local browser storage is only a one-time migration source now. */
export function clearLocal() {
  localStorage.removeItem(KEY);
}

export function exportCharacter(c: Character) {
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${c.name.replace(/[<>:"/\\|?*]/g, "_") || "character"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
