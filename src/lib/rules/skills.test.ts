import { describe, expect, it } from 'vitest';
import { addSkillXp, costAt, diffLevels, exhaustionBand, needsExhaustionConfirm, newSkillDefinition, normalizeSkills, rankOf, resolveLevel, xpToNext, copySkillFor } from './skills';
import { normalizeCharacter } from '../storage';
import { deriveCharacter, normalizeActiveEffects, reconcileEffects } from './derived';
import type { Effect } from './items';

const fx = (id: string, value: number, kind: Effect['kind'] = 'ac'): Effect => ({ id, kind, target: '', value, automation: 'auto' });

describe('skills', () => {
  it('old character loads with empty skills and 0 exhaustion', () => {
    const c = normalizeCharacter({ name: 'Старый' });
    expect(c.skills).toEqual([]); expect(c.exhaustion).toBe(0);
  });
  it('ranks', () => { expect(rankOf(5)).toBe('Новичок'); expect(rankOf(6)).toBe('Любитель'); expect(rankOf(25)).toBe('Мастер'); });
  it('xp table transitions', () => { expect(xpToNext('active', 1)).toBe(5); expect(xpToNext('passive', 24)).toBe(22); expect(xpToNext('active', 25)).toBeNull(); });
  it('carry-over XP', () => { expect(addSkillXp('active', 1, 4, 3)).toEqual({ level: 2, xp: 2, maxed: false }); });
  it('max level 25', () => { expect(addSkillXp('active', 24, 0, 10000)).toEqual({ level: 25, xp: 0, maxed: true }); });
  it('+1 XP per use', () => { expect(addSkillXp('active', 3, 1, 1)).toEqual({ level: 3, xp: 2, maxed: false }); });
  it('add/update/remove inheritance', () => {
    const d = newSkillDefinition();
    d.levels[0]!.ops = [{ op: 'add', effect: fx('a', 1) }, { op: 'add', effect: fx('b', 2) }];
    d.levels[4]!.ops = [{ op: 'update', effect: fx('a', 3) }];
    d.levels[9]!.ops = [{ op: 'remove', effectId: 'b' }];
    expect(resolveLevel(d, 3).map(e => e.value)).toEqual([1, 2]);
    expect(resolveLevel(d, 5).find(e => e.id === 'a')!.value).toBe(3);
    expect(resolveLevel(d, 10).map(e => e.id)).toEqual(['a']);
  });
  it('cost inherits from previous level; passive costs 0', () => {
    const d = newSkillDefinition(); d.levels[0]!.exhaustionCost = 10; d.levels[24]!.exhaustionCost = 40;
    expect(costAt(d, 12)).toBe(10); expect(costAt(d, 25)).toBe(40);
    expect(costAt({ ...d, type: 'passive' }, 25)).toBe(0);
  });
  it('exhaustion bands and 500+ confirm', () => {
    expect(exhaustionBand(150).label).toBe('100–199'); expect(exhaustionBand(700).label).toBe('500+');
    expect(needsExhaustionConfirm(480, 20)).toBe(true); expect(needsExhaustionConfirm(470, 20)).toBe(false);
  });
  it('diff shows affected later levels', () => {
    const a = newSkillDefinition(); a.levels[0]!.ops = [{ op: 'add', effect: fx('a', 1) }];
    const b = structuredClone(a); (b.levels[0]!.ops[0] as any).effect.value = 2;
    expect(diffLevels(a, b)).toHaveLength(25);
  });
  it('copy for student drops history and XP', () => {
    const s = normalizeSkills([{ id: 's', definition: newSkillDefinition(), level: 7, xp: 3, history: [{ id: '1', at: '', text: 'x' }] }])[0]!;
    expect(copySkillFor(s, 'teach_current', 'n')).toMatchObject({ level: 7, xp: 0, history: [] });
    expect(copySkillFor(s, 'teach_novice', 'n').level).toBe(1);
  });
  it('passive skill bonus stacks with other sources; skill effects survive equipment sync', () => {
    const d = newSkillDefinition('passive'); d.name = 'Стойкая кожа'; d.levels[0]!.ops = [{ op: 'add', effect: fx('a', 2) }];
    const c = normalizeCharacter({ name: 'Т', skills: [{ id: 's', definition: d, level: 1, xp: 0 }],
      activeEffects: [{ id: 'e', sourceItemId: 'sk2', sourceType: 'skill', sourceName: 'Щит', effect: { ...fx('z', 1), lifecycle: 'sustained' }, equipmentBound: true }] });
    const base = deriveCharacter(normalizeCharacter({ name: 'Т' })).ac;
    expect(deriveCharacter(c).ac).toBe(base + 3);
    expect(reconcileEffects(c).activeEffects).toHaveLength(1);
    expect(normalizeActiveEffects([{ id: 'x', sourceItemId: 'i', sourceName: 'n', effect: fx('q', 1) }])[0]!.sourceType).toBe('item');
  });
});
