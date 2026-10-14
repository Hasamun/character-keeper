import { describe, expect, it } from 'vitest';
import { newCharacter } from './index';
import { newSkillDefinition, transferSkill } from './skills';
const hero = (id: string, name: string, skills: any[] = [], fx: any[] = []): any => ({ ...newCharacter(), id, name, skills, exhaustion: 0, activeEffects: fx });
const sk = { id: 's', definition: { ...newSkillDefinition(), name: 'Удар' }, level: 7, xp: 4, draft: false, history: [] };
describe('skill transfer', () => {
  it('teach_current keeps level, resets XP, leaves source intact', () => {
    const r: any = transferSkill(hero('a', 'А', [sk]), hero('b', 'Б'), 's', 'teach_current', 'n');
    expect(r.to.skills[0]).toMatchObject({ id: 'n', level: 7, xp: 0 }); expect(r.from.skills).toHaveLength(1);
  });
  it('teach_novice and copy start at level 1', () => {
    for (const m of ['teach_novice', 'copy'] as const) expect((transferSkill(hero('a', 'А', [sk]), hero('b', 'Б'), 's', m, 'n') as any).to.skills[0]).toMatchObject({ level: 1, xp: 0 });
  });
  it('move keeps progress and removes the skill and its effects from the source', () => {
    const r: any = transferSkill(hero('a', 'А', [sk], [{ id: 'e', sourceType: 'skill', sourceItemId: 's' }, { id: 'i', sourceType: 'item', sourceItemId: 'x' }]), hero('b', 'Б'), 's', 'move', 'n');
    expect(r.to.skills[0]).toMatchObject({ level: 7, xp: 4 }); expect(r.from.skills).toEqual([]); expect(r.from.activeEffects.map((a: any) => a.id)).toEqual(['i']);
  });
  it('same hero is rejected', () => expect(transferSkill(hero('a', 'А', [sk]), hero('a', 'А'), 's', 'copy', 'n')).toHaveProperty('error'));
});
