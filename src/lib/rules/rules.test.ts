import { describe, expect, it } from "vitest";
import { addPrimaryExp, addSecondaryExp, editorAdjust, getArmorClass, getHpComponents, newCharacter } from ".";

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

  it("editor step costs table value and refunds it", () => {
    const up = editorAdjust(newCharacter(), 1000, "primary", "Сила", 1);
    expect(up.freeExp).toBe(960);
    const down = editorAdjust(up.character, up.freeExp, "primary", "Сила", -1);
    expect(down.freeExp).toBe(1000);
    const below = editorAdjust(newCharacter(), 1000, "primary", "Сила", -1);
    expect(below.freeExp).toBe(1070);
    expect(below.character.primary["Сила"]).toEqual({ level: -1, subIndex: 4, progress: 0 });
  });

  it("editor limits levels to -2..4", () => {
    const c = newCharacter();
    c.primary["Сила"] = { level: 4, subIndex: 0, progress: 0 };
    expect(editorAdjust(c, 1000, "primary", "Сила", 1).error).not.toBeNull();
  });
});
