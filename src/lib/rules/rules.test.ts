import { describe, expect, it } from "vitest";
import { addPrimaryExp, addSecondaryExp, computeFreeExp, editorAdjust, getArmorClass, getHpComponents, newCharacter, type Character } from ".";

describe("game rules", () => {
  it("primary sublevel up carries over remainder", () => {
    const { character } = addPrimaryExp(newCharacter(), "Сила", 50);
    expect(character.primary["Сила"]).toEqual({ level: 0, subIndex: 1, progress: 10 });
  });

  it("primary full level 0 costs 220 and moves to level 1", () => {
    const { character } = addPrimaryExp(newCharacter(), "Сила", 220);
    expect(character.primary["Сила"]).toEqual({ level: 1, subIndex: 0, progress: 0 });
  });

  it("removing exp rolls back to previous level", () => {
    const { character } = addPrimaryExp(newCharacter(), "Сила", -10);
    expect(character.primary["Сила"]).toEqual({ level: -1, subIndex: 4, progress: 60 });
  });

  it("primary floors at -6", () => {
    const { character } = addPrimaryExp(newCharacter(), "Сила", -100000);
    expect(character.primary["Сила"]).toEqual({ level: -6, subIndex: 0, progress: 0 });
  });

  it("primary caps at 10 with zero progress", () => {
    const { character } = addPrimaryExp(newCharacter(), "Сила", 10_000_000);
    expect(character.primary["Сила"]).toEqual({ level: 10, subIndex: 0, progress: 0 });
  });

  it("secondary level up gives round(sum/3) bonus to its primary", () => {
    // level 0 row 30+40+45 = 115 → bonus 38
    const { character } = addSecondaryExp(newCharacter(), "Атлетика", 115);
    expect(character.secondary["Атлетика"]!.level).toBe(1);
    expect(character.primary["Сила"]).toEqual({ level: 0, subIndex: 0, progress: 38 });
  });

  it("secondary caps at level 10 sublevel 3 with full progress", () => {
    const { character } = addSecondaryExp(newCharacter(), "Магия", 10_000_000);
    expect(character.secondary["Магия"]).toEqual({ level: 10, subIndex: 2, progress: 1250 });
  });

  it("HP = race + class + Con + Stamina + Str bonuses", () => {
    const c = newCharacter();
    c.race = "Дворф"; c.characterClass = "Танк";
    c.primary["Телосложение"]!.level = 2; c.secondary["Стойкость"]!.level = 1; c.primary["Сила"]!.level = 0;
    expect(getHpComponents(c).Итого).toBe(13 + 15 + 5 + 1 + 1);
  });

  it("AC = 10 + Dex level", () => {
    const c = newCharacter();
    c.primary["Ловкость"]!.level = 3;
    expect(getArmorClass(c)).toBe(13);
  });

  const step = (c: Character, type: "primary" | "secondary", name: string, dir: 1 | -1, n = 1) => {
    for (let i = 0; i < n; i++) c = editorAdjust(c, type, name, dir).character;
    return c;
  };

  it("editor: first primary sublevel costs 40, below zero refunds 70", () => {
    expect(computeFreeExp(step(newCharacter(), "primary", "Сила", 1))).toBe(960);
    expect(computeFreeExp(step(newCharacter(), "primary", "Сила", -1))).toBe(1070);
  });

  it("editor: raising a skill then lowering it back returns exactly 1000", () => {
    let c = step(newCharacter(), "secondary", "Атлетика", 1, 7);
    c = step(c, "secondary", "Атлетика", -1, 7);
    expect(computeFreeExp(c)).toBe(1000);
  });

  it("editor: no up/down sequence ever yields more than the refund of below-zero levels", () => {
    let c = newCharacter();
    for (let i = 0; i < 50; i++) {
      c = step(c, "secondary", "Магия", 1, 3);
      c = step(c, "secondary", "Магия", -1, 3);
      c = step(c, "secondary", "Магия", 1);
      c = step(c, "secondary", "Магия", -1);
    }
    expect(computeFreeExp(c)).toBe(1000);
  });

  it("editor: overspending makes free exp negative", () => {
    const c = step(newCharacter(), "primary", "Сила", 1, 20);
    expect(computeFreeExp(c)).toBeLessThan(0);
  });

  it("editor limits levels to -2..4", () => {
    const c = newCharacter();
    c.primary["Сила"] = { level: 4, subIndex: 0, progress: 0 };
    expect(editorAdjust(c, "primary", "Сила", 1).error).not.toBeNull();
    const low = newCharacter();
    low.primary["Сила"] = { level: -2, subIndex: 0, progress: 0 };
    expect(editorAdjust(low, "primary", "Сила", -1).error).not.toBeNull();
  });
});
