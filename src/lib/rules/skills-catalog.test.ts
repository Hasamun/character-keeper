import { describe, expect, it } from 'vitest';
import { newSkillDefinition, publishableSkill, skillFromCatalog } from './skills';
describe('skill catalog', () => {
  it('publishes only the definition', () => {
    const p: any = publishableSkill({ ...newSkillDefinition('passive'), name: '  Щит ', xp: 99, history: [1] });
    expect(p.name).toBe('Щит'); expect(p.levels).toHaveLength(25); expect(p.xp).toBeUndefined(); expect(p.history).toBeUndefined();
  });
  it('copy starts at level 1 with 0 XP and is independent', () => {
    const src = { ...newSkillDefinition(), name: 'A' };
    const s = skillFromCatalog(src, 'x', 'A');
    expect(s).toMatchObject({ id: 'x', level: 1, xp: 0 });
    s.definition.name = 'B'; expect(src.name).toBe('A');
  });
});
