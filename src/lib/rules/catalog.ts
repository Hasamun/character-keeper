import { normalizeInventory, type Item } from './inventory';
export const SUBMISSION_LABELS = { pending: 'Ожидает проверки', approved: 'Одобрено', rejected: 'Отклонено' } as const;
export function catalogTemplate(raw: unknown): Item {
  const i = normalizeInventory({ items: [raw] }).items[0];
  if (!i || !i.name.trim()) throw new Error('Некорректный предмет');
  const { notes: _n, history: _h, createdAt: _c, ...template } = i;
  return { ...template, quantity: 1, effects: (i.effects ?? []).map(e => { const { remainingCharges: _r, ...effect } = e; return effect; }) };
}
export function catalogCopy(raw: unknown, id: string): Item {
  const t = catalogTemplate(raw);
  return { ...t, id, effects: (t.effects ?? []).map(e => ({ ...e, target: e.target === t.id ? id : e.target, remainingCharges: e.charges })), createdAt: new Date().toISOString() };
}
export function mayReview(active: boolean, admin: boolean, status: string, revision: number, expected: number) { return active && admin && status === 'pending' && revision === expected; }
export function mayBlock(actor: string, target: string, active: boolean, admin: boolean, targetAdmin: boolean, remainingAdmins: number) { return active && admin && actor !== target && (!targetAdmin || remainingAdmins > 0); }
export const catalogSearch = (s: Record<string, unknown>) => ({ q: String(s.q ?? '').slice(0,120), category: ['gear','consumable','misc'].includes(String(s.category)) ? String(s.category) : 'all', rank: ['F','E','D','C','B','A','S'].includes(String(s.rank)) ? String(s.rank) : 'all', slot: String(s.slot ?? 'all'), subtype: String(s.subtype ?? '').slice(0,100), sort: ['name','rank','price'].includes(String(s.sort)) ? String(s.sort) : 'recent', page: Math.max(1,Math.min(10000,Math.trunc(Number(s.page))||1)), view: s.view === 'list' ? 'list' : 'grid' });
export type CatalogSearch = ReturnType<typeof catalogSearch>;
