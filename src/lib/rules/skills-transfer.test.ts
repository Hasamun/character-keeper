import { describe, expect, it } from 'vitest';
import { newCharacter } from './index';
import { newSkillDefinition, transferPayload, transferSkill } from './skills';
const hero = (id: string, name: string, skills: any[] = [], fx: any[] = []): any => ({ ...newCharacter(), id, name, skills, exhaustion: 0, activeEffects: fx });
const sk = { id: 's', definition: { ...newSkillDefinition(), name: 'Удар' }, level: 7, xp: 4, draft: false, history: [] };
describe('skill transfer', () => {
  it('teach_current keeps level, resets XP, leaves source intact', () => {
    const r: any = transferSkill(hero('a', 'А', [sk]), hero('b', 'Б'), 's', 'teach_current', 'n');
    expect(r.to.skills[0]).toMatchObject({ id: 'n', level: 7, xp: 0 }); expect(r.from.skills).toHaveLength(1);
  });
  it('teach_novice starts at level 1', () => expect((transferSkill(hero('a', 'А', [sk]), hero('b', 'Б'), 's', 'teach_novice', 'n') as any).to.skills[0]).toMatchObject({ level: 1, xp: 0 }));
  it('move is rejected and sender keeps the skill and its effects', () => {
    expect(transferSkill(hero('a', 'А', [sk]), hero('b', 'Б'), 's', 'move' as any, 'n')).toHaveProperty('error');
    const from = hero('a', 'А', [sk], [{ id: 'e', sourceType: 'skill', sourceItemId: 's' }]); from.exhaustion = 300;
    const r: any = transferSkill(from, hero('b', 'Б'), 's', 'teach_current', 'n');
    expect(r.from).toBe(from); expect(r.to.exhaustion).toBe(0); expect(r.to.activeEffects).toEqual([]); expect(r.to.skills[0].history).toHaveLength(1);
  });
  it('payload carries no history or usage', () => expect(Object.keys(transferPayload({ ...sk, history: [{ id: 'h', at: '', text: 'x' }], lastUse: {} } as any, 'teach_current')).sort()).toEqual(['definition', 'level']));
  it('same hero is rejected', () => expect(transferSkill(hero('a', 'А', [sk]), hero('a', 'А'), 's', 'teach_novice', 'n')).toHaveProperty('error'));
});
