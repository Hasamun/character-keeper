import { describe, expect, it } from 'vitest';
import { diffLevels, newSkillDefinition, opsFor, resolveLevel, setLevelCost, setLevelEffects, costAt, commitDefinition, normalizeSkills } from './skills';
import type { Effect } from './items';
const e = (id: string, value: number): Effect => ({ id, kind: 'ac', target: '', value, automation: 'auto' });
describe('skill editor', () => {
  it('opsFor emits add/update/remove only for differences', () => {
    expect(opsFor([e('a', 1), e('b', 1)], [e('a', 2), e('c', 1)])).toEqual([{ op: 'update', effect: e('a', 2) }, { op: 'add', effect: e('c', 1) }, { op: 'remove', effectId: 'b' }]);
    expect(opsFor([e('a', 1)], [e('a', 1)])).toEqual([]);
  });
  it('level edit is inherited by later levels and keeps effect ids', () => {
    let d = setLevelEffects(newSkillDefinition(), 1, 1, [e('a', 1)]);
    d = setLevelEffects(d, 3, 3, [e('a', 3)]);
    expect(resolveLevel(d, 2)).toEqual([e('a', 1)]);
    expect(resolveLevel(d, 25)).toEqual([e('a', 3)]);
    expect(diffLevels(setLevelEffects(newSkillDefinition(), 1, 1, [e('a', 1)]), d).map(x => x.level)).toEqual(Array.from({ length: 23 }, (_, i) => i + 3));
  });
  it('rank scope sets the rank and clears inner patches, keeps later ones', () => {
    let d = setLevelEffects(newSkillDefinition(), 3, 3, [e('a', 3)]);
    d = setLevelEffects(d, 7, 7, [e('a', 7)]);
    d = setLevelEffects(d, 1, 5, [e('a', 1)]);
    expect(resolveLevel(d, 5)).toEqual([e('a', 1)]);
    expect(resolveLevel(d, 7)).toEqual([e('a', 7)]);
  });
  it('cost can be set and cleared to inherit', () => {
    let d = setLevelCost(newSkillDefinition(), 1, 1, 10);
    d = setLevelCost(d, 6, 6, 20);
    expect(costAt(d, 10)).toBe(20);
    expect(costAt(setLevelCost(d, 6, 6, undefined), 10)).toBe(10);
  });
  it('commitDefinition keeps XP/level and remembers previous version', () => {
    const def = newSkillDefinition(); def.name = 'A';
    const c: any = { skills: normalizeSkills([{ id: 's', definition: def, level: 4, xp: 3, history: [] }]), activeEffects: [] };
    const n = commitDefinition(c, 's', { ...def, name: 'B' }, true, 'edit');
    expect(n.skills![0]).toMatchObject({ level: 4, xp: 3, draft: true });
    expect(n.skills![0]!.versions![0]!.definition.name).toBe('A');
    expect(normalizeSkills(n.skills)[0]!.versions!.length).toBe(1);
  });
});
