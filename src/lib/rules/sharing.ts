import type { Character } from './index';

export const SHARE_SECTIONS = ['bio', 'primary', 'secondary', 'inventory', 'notes', 'history'] as const;
export type ShareSection = typeof SHARE_SECTIONS[number];
export type Permission = 'none' | 'read' | 'edit';
export type Permissions = Record<ShareSection, Permission>;
export const SECTION_LABELS: Record<ShareSection, string> = { bio: 'Основные сведения', primary: 'Характеристики', secondary: 'Навыки и опыт', inventory: 'Инвентарь', notes: 'Заметки', history: 'История' };
export function normalizePermissions(raw: unknown): Permissions {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return Object.fromEntries(SHARE_SECTIONS.map(k => [k, r[k] === 'edit' && k !== 'history' ? 'edit' : r[k] === 'read' || r[k] === 'edit' && k === 'history' ? 'read' : 'none'])) as Permissions;
}
export const hasPermission = (p: Permissions, section: ShareSection, edit = false) => edit ? p[section] === 'edit' : p[section] !== 'none';
export const ownsImagePath = (path: string, ownerId: string) => path.startsWith(`${ownerId}/`) && !path.includes('..');
export const canDeriveShared = (p: Permissions) => ['bio', 'primary', 'secondary', 'inventory'].every(k => p[k as ShareSection] !== 'none');
export function canShareAction(p: Permissions, action: 'primaryExp' | 'secondaryExp' | 'inventory' | 'use' | 'notes' | 'bio') {
  if (action === 'secondaryExp') return p.primary === 'edit' && p.secondary === 'edit';
  if (action === 'primaryExp') return p.primary === 'edit';
  return p[action === 'use' ? 'inventory' : action] === 'edit';
}
/** Never serialize hidden sections, including history which may mention every section. */
export function projectShared(c: Character, permissions: Permissions) {
  const p = normalizePermissions(permissions);
  return { id: c.id, updatedAt: c.updatedAt,
    ...(p.bio !== 'none' ? { name: c.name, race: c.race, characterClass: c.characterClass, avatar: c.avatar } : {}),
    ...(p.primary !== 'none' ? { primary: c.primary } : {}),
    ...(p.secondary !== 'none' ? { secondary: c.secondary } : {}),
    ...(p.inventory !== 'none' ? { inventory: c.inventory, activeEffects: c.activeEffects ?? [] } : {}),
    ...(p.notes !== 'none' ? { notes: c.notes } : {}),
    ...(p.history !== 'none' && SHARE_SECTIONS.filter(k => k !== 'history').every(k => p[k] !== 'none') ? { log: c.log } : {}),
  };
}
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export function invitationUsable(status: string, expiresAt: string, now: number, active: boolean) {
  return active && status === 'pending' && new Date(expiresAt).getTime() > now;
}