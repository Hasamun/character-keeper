import { describe, expect, it } from 'vitest';
import { newSkillDefinition, performSkillAction, normalizeSkills, xpToNext } from './skills';
import { normalizeCharacter } from '../storage';
import { deriveCharacter } from './derived';
import type { Character } from './index';

function hero(type: 'active' | 'passive' = 'active', exhaustion = 0): Character {
  const d = newSkillDefinition(type); d.name = 'Удар'; d.levels[0]!.exhaustionCost = 10; d.levels[1]!.exhaustionCost = 12;
  d.levels[0]!.ops = [{ op: 'add', effect: { id: 'ac', kind: 'ac', target: '', value: 1, automation: 'auto', lifecycle: 'sustained' } }];
  d.levels[1]!.ops = [{ op: 'update', effect: { id: 'ac', kind: 'ac', target: '', value: 2, automation: 'auto', lifecycle: 'sustained' } }];
  return normalizeCharacter({ name: 'Т', exhaustion, skills: [{ id: 's', definition: d, level: 1, xp: 0 }] });
}
const ok = (r: ReturnType<typeof performSkillAction>) => { if ('error' in r) throw new Error(r.error); return r; };

describe('skill actions', () => {
  it('apply gives exactly +1 XP and spends level cost', () => {
    const r = ok(performSkillAction(hero(), { type: 'apply', skillId: 's' }, 'op1'));
    expect(r.character.skills![0]).toMatchObject({ level: 1, xp: 1 }); expect(r.character.exhaustion).toBe(10);
  });
  it('passive skill cannot be applied', () => { expect(performSkillAction(hero('passive'), { type: 'apply', skillId: 's' }, 'o')).toHaveProperty('error'); });
  it('repeat apply refreshes effect without stacking, still +1 XP and cost', () => {
    const c = hero(), base = deriveCharacter(normalizeCharacter({ name: 'Т' })).ac;
    const a = ok(performSkillAction(c, { type: 'apply', skillId: 's' }, '1')).character;
    const b = ok(performSkillAction(a, { type: 'apply', skillId: 's' }, '2')).character;
    expect(b.activeEffects!.filter(x => x.sourceType === 'skill')).toHaveLength(1);
    expect(deriveCharacter(b).ac).toBe(base + 1); expect(b.skills![0]!.xp).toBe(2); expect(b.exhaustion).toBe(20);
  });
  it('level-up updates the running effect', () => {
    let c = ok(performSkillAction(hero(), { type: 'apply', skillId: 's' }, '1')).character;
    c = ok(performSkillAction(c, { type: 'xp', skillId: 's', delta: 4, reason: 'бой' }, '2')).character;
    expect(c.skills![0]!.level).toBe(2); expect(c.activeEffects!.find(x => x.sourceType === 'skill')!.effect.value).toBe(2);
  });
  it('xp change requires reason', () => { expect(performSkillAction(hero(), { type: 'xp', skillId: 's', delta: 1, reason: ' ' }, 'o')).toHaveProperty('error'); });
  it('undo restores state and compensates the op', () => {
    const c = hero(); const a = ok(performSkillAction(c, { type: 'apply', skillId: 's' }, 'op1'));
    const u = ok(performSkillAction(a.character, { type: 'undo', skillId: 's' }, 'op2'));
    expect(u.character.exhaustion).toBe(0); expect(u.character.skills![0]).toMatchObject({ level: 1, xp: 0 });
    expect(u.character.activeEffects).toEqual([]); expect(u.entries[0]!.compensates).toBe('op1');
  });
  it('undo blocked after later change', () => {
    let c = ok(performSkillAction(hero(), { type: 'apply', skillId: 's' }, '1')).character;
    c = ok(performSkillAction(c, { type: 'xp', skillId: 's', delta: 1, reason: 'x' }, '2')).character;
    expect(performSkillAction(c, { type: 'undo', skillId: 's' }, '3')).toHaveProperty('error');
  });
  it('rest lowers exhaustion, not below zero', () => {
    expect(ok(performSkillAction(hero('active', 30), { type: 'exhaustion', delta: -50, reason: '', kind: 'rest' }, '1')).character.exhaustion).toBe(0);
  });
  it('level 4 use applies level-4 params, then levels up to 5', () => {
    const d = newSkillDefinition('active'); d.name = 'Удар'; d.levels[0]!.exhaustionCost = 10; d.levels[4]!.exhaustionCost = 50;
    d.levels[0]!.ops = [{ op: 'add', effect: { id: 'dmg', kind: 'extra_damage', target: '', value: 4, automation: 'manual', lifecycle: 'instant' } }];
    d.levels[4]!.ops = [{ op: 'update', effect: { id: 'dmg', kind: 'extra_damage', target: '', value: 5, automation: 'manual', lifecycle: 'instant' } }];

    const lv = normalizeCharacter({ name: 'Т', skills: [{ id: 's', definition: d, level: 4, xp: 0 }] }); const full = { ...lv, skills: [{ ...lv.skills![0]!, xp: xpToNext('active', 4)! - 1 }] };
    const r = ok(performSkillAction(full, { type: 'apply', skillId: 's' }, 'op'));
    expect(r.character.skills![0]!.level).toBe(5);
    expect(r.character.exhaustion).toBe(10);
    expect((r.entries[0]!.details['instant'] as any[])[0].value).toBe(4);
    expect(r.character.activeEffects).toEqual([]);
  });
  it('instant and unspecified effects never become active', () => {
    const d = newSkillDefinition('active'); d.name = 'И';
    d.levels[0]!.ops = [{ op: 'add', effect: { id: 'a', kind: 'ac', target: '', value: 1, automation: 'auto', lifecycle: 'instant' } }, { op: 'add', effect: { id: 'b', kind: 'ac', target: '', value: 1, automation: 'auto' } }];
    const c = normalizeCharacter({ name: 'Т', skills: [{ id: 's', definition: d, level: 1, xp: 0 }] });
    expect(ok(performSkillAction(c, { type: 'apply', skillId: 's' }, '1')).character.activeEffects).toEqual([]);
  });
  it('old stored non-sustained skill effects are dropped on load, item effects kept', () => {
    const c = normalizeCharacter({ name: 'Т', activeEffects: [{ id: 'x', sourceItemId: 's', sourceType: 'skill', sourceName: 'n', effect: { id: 'e', kind: 'ac', target: '', value: 1, automation: 'auto' } }, { id: 'y', sourceItemId: 'i', sourceName: 'n', effect: { id: 'e', kind: 'ac', target: '', value: 1, automation: 'auto' } }] });
    expect(c.activeEffects!.map(a => a.id)).toEqual(['y']);
  });
  it('lastUse survives normalization', () => {
    const c = ok(performSkillAction(hero(), { type: 'apply', skillId: 's' }, 'op1')).character;
    expect(normalizeSkills(JSON.parse(JSON.stringify(c.skills)))[0]!.lastUse?.opId).toBe('op1');
  });
});
