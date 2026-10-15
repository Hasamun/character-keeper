import { describe, expect, it } from 'vitest';
import { mergeSelection, newSkillDefinition, resolveLevel, costAt, setLevelEffects, setLevelCost, skillFromCatalog } from './skills';
const fx = (id: string, value: number) => ({ id, kind: 'ac' as const, target: '', value, automation: 'auto' as const });
const cur = setLevelCost(setLevelEffects({ ...newSkillDefinition('active'), name: 'Щит' }, 1, 25, [fx('a', 1), fx('b', 1)]), 1, 1, 5);
const prop = setLevelCost(setLevelEffects(cur, 3, 25, [fx('a', 3), fx('c', 2)]), 3, 3, 9);
describe('selective merge', () => {
  it('single effect: takes only the picked change, keeps cost and other effects', () => {
    const m = mergeSelection(cur, prop, { 3: ['a'] }, false);
    expect(resolveLevel(m, 3).map(e => [e.id, e.value])).toEqual([['a', 3], ['b', 1]]); expect(costAt(m, 3)).toBe(5);
  });
  it('picked removal removes, picked addition adds', () => {
    const m = mergeSelection(cur, prop, { 3: ['b', 'c'] }, false);
    expect(resolveLevel(m, 3).map(e => e.id).sort()).toEqual(['a', 'c']);
  });
  it('whole level takes cost; unpicked levels unchanged', () => {
    const m = mergeSelection(cur, prop, { 3: 'all' }, false);
    expect(costAt(m, 3)).toBe(9); expect(resolveLevel(m, 4).map(e => e.id).sort()).toEqual(['a', 'b']);
  });
  it('nothing picked keeps user values and name', () => { const m = mergeSelection(cur, { ...prop, name: 'X' }, {}, false); expect(m.name).toBe('Щит'); expect(resolveLevel(m, 10)).toEqual(resolveLevel(cur, 10)); });
});
describe('catalog link', () => {
  it('copy keeps template id and version at level 1', () => expect(skillFromCatalog(cur, 'n', 'Щит', undefined, { id: 't', version: 4 })).toMatchObject({ templateId: 't', templateVersion: 4, level: 1, xp: 0 }));
});
