import { describe, expect, it } from "vitest";
import { emptyInventory, equipHand, equipSlot, isEquipped, putOnBelt, removeItem, swapWeapons, unequip, upsertItem, type Item } from "./inventory";

const item = (p: Partial<Item>): Item => ({ id: p.name ?? "x", name: "x", category: "misc", quantity: 1, description: "", ...p });
const base = () => {
  let inv = emptyInventory();
  inv = upsertItem(inv, item({ id: "helm", name: "helm", category: "gear", slot: "helmet" }));
  inv = upsertItem(inv, item({ id: "sword", name: "sword", category: "gear", slot: "weapon" }));
  inv = upsertItem(inv, item({ id: "shield", name: "shield", category: "gear", slot: "offhand" }));
  inv = upsertItem(inv, item({ id: "belt", name: "belt", category: "gear", slot: "belt", beltCapacity: 3 }));
  inv = upsertItem(inv, item({ id: "potion", name: "potion", category: "consumable" }));
  return inv;
};

describe("inventory", () => {
  it("equips only into matching slot", () => {
    expect(equipSlot(base(), "helm", "chest").error).not.toBeNull();
    expect(equipSlot(base(), "helm", "helmet").inventory.equipped.helmet).toBe("helm");
  });

  it("shield fits only the off hand", () => {
    expect(equipHand(base(), "shield", 0, "main").error).not.toBeNull();
    expect(equipHand(base(), "shield", 0, "off").inventory.weaponSets[0].off).toBe("shield");
  });

  it("swap toggles active weapon set", () => {
    expect(swapWeapons(base()).inventory.activeSet).toBe(1);
  });

  it("belt gives as many quick slots as its capacity (1-4)", () => {
    const inv = equipSlot(base(), "belt", "belt").inventory;
    expect(inv.belt).toHaveLength(3);
    const big = upsertItem(base(), item({ id: "b9", name: "b9", category: "gear", slot: "belt", beltCapacity: 9 }));
    expect(equipSlot(big, "b9", "belt").inventory.belt).toHaveLength(4);
  });

  it("only consumables go on the belt; removing belt clears it", () => {
    let inv = equipSlot(base(), "belt", "belt").inventory;
    expect(putOnBelt(inv, "sword", 0).error).not.toBeNull();
    inv = putOnBelt(inv, "potion", 0).inventory;
    expect(inv.belt[0]).toBe("potion");
    inv = unequip(inv, "belt").inventory;
    expect(inv.belt).toHaveLength(0);
    expect(isEquipped(inv, "potion")).toBe(false);
  });

  it("deleting an equipped item unequips it", () => {
    const inv = removeItem(equipSlot(base(), "helm", "helmet").inventory, "helm");
    expect(inv.equipped.helmet).toBeNull();
  });
});

import { addItem, autoEquip, duplicateItem, normalizeInventory } from "./inventory";
import { equipmentWarnings } from "./items";
import { newCharacter } from "./index";

describe("extended items", () => {
  it("keeps old items valid and adds cloak slot", () => {
    const inv = normalizeInventory({ items: [{ id: "a", name: "Old", category: "gear", slot: "helmet", quantity: 1 }], equipped: { helmet: "a" } });
    expect(inv.items[0]!.name).toBe("Old");
    expect(inv.equipped.helmet).toBe("a");
    expect(inv.equipped.cloak).toBeNull();
  });
  it("merges identical consumables, not different ones or gear", () => {
    let inv = emptyInventory();
    inv = addItem(inv, item({ id: "p1", name: "Зелье", category: "consumable", quantity: 2 })).inventory;
    inv = addItem(inv, item({ id: "p2", name: "Зелье", category: "consumable", quantity: 3 })).inventory;
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0]!.quantity).toBe(5);
    inv = addItem(inv, item({ id: "p3", name: "Зелье", category: "consumable", rank: "S" })).inventory;
    expect(inv.items).toHaveLength(2);
    inv = addItem(inv, item({ id: "s1", name: "Меч", category: "gear", slot: "weapon" })).inventory;
    inv = addItem(inv, item({ id: "s2", name: "Меч", category: "gear", slot: "weapon" })).inventory;
    expect(inv.items.filter((i) => i.name === "Меч")).toHaveLength(2);
  });
  it("duplicate is an independent instance", () => {
    const inv = duplicateItem(base(), "sword", "sword2");
    expect(inv.items.find((i) => i.id === "sword2")).toBeTruthy();
    expect(inv.items.find((i) => i.id === "sword")!.name).toBe("sword");
  });
  it("warns but allows two-handed with shield and unmet requirements", () => {
    let inv = upsertItem(base(), item({ id: "gs", name: "gs", category: "gear", slot: "weapon", weapon: { damage: "2d6", attackBonus: 0, damageType: "", attackMode: "str", twoHanded: true }, requirements: [{ stat: "Сила", min: 3 }] }));
    inv = autoEquip(inv, "gs").inventory;
    inv = autoEquip(inv, "shield").inventory;
    expect(inv.weaponSets[0]).toEqual({ main: "gs", off: "shield" });
    const w = equipmentWarnings(newCharacter(), inv).map((x) => x.kind);
    expect(w).toContain("two_handed");
    expect(w).toContain("requirement");
  });
  it("deleting an equipped item clears its slot", () => {
    const inv = removeItem(autoEquip(base(), "helm").inventory, "helm");
    expect(inv.equipped.helmet).toBeNull();
  });
});
