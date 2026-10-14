import { describe, expect, it } from 'vitest';
import { aiDraftToDefinition, costAt, mergeSelectedLevels, newSkillDefinition, resolveLevel, setLevelEffects, type AiSkillDraft } from './skills';
const fx = (key: string, value: number) => ({ key, kind: 'ac' as const, target: '', value, automation: 'auto' as const, damageType: null, condition: null, duration: null, description: null });
const draft: AiSkillDraft = { name: 'Щит', type: 'active', description: 'd', levels: [
  { level: 1, exhaustionCost: 10, effects: [fx('ac', 1)] }, { level: 5, exhaustionCost: 15, effects: [fx('ac', 2)] }, { level: 10, exhaustionCost: null, effects: [] } ] };
describe('skill AI drafts', () => {
  it('fills missing levels by inheritance and keeps one id per key', () => {
    let n = 0; const d = aiDraftToDefinition(draft, () => `id${++n}`);
    expect(resolveLevel(d, 4)[0]!.value).toBe(1);
    expect(resolveLevel(d, 9)[0]).toMatchObject({ id: 'id1', value: 2 });
    expect(resolveLevel(d, 25)).toEqual([]);
    expect(costAt(d, 4)).toBe(10); expect(costAt(d, 20)).toBe(15);
    expect(d.levels[1]!.origin).toBe('empty'); expect(d.levels[4]!.origin).toBe('ai');
  });
  it('reuses existing ids when keys match', () => {
    expect(resolveLevel(aiDraftToDefinition(draft, () => 'new', ['ac']), 1)[0]!.id).toBe('ac');
  });
  it('accepts only selected levels; unselected keep current resolved values', () => {
    const cur = { ...setLevelEffects(newSkillDefinition('active'), 1, 1, [{ id: 'id1', kind: 'ac', target: '', value: 7, automation: 'auto' }]), name: 'Старый' };
    let n = 0; const p = aiDraftToDefinition(draft, () => `id${++n}`);
    const m = mergeSelectedLevels(cur, p, new Set([5]), false);
    expect(m.name).toBe('Старый');
    expect(resolveLevel(m, 4)[0]!.value).toBe(7);
    expect(resolveLevel(m, 5)[0]!.value).toBe(2);
    expect(resolveLevel(m, 6)[0]!.value).toBe(7);
    expect(m.levels[4]!.origin).toBe('ai');
  });
});
