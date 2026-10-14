import { describe, it, expect } from 'vitest';
import { newCharacter } from './index';
import { normalizePermissions, projectShared, canShareAction, canDeriveShared, invitationUsable, INVITE_LIFETIME_MS, ownsImagePath } from './sharing';
describe('Sharing permissions', () => {
  it('defaults every section to no access', () => expect(Object.values(normalizePermissions({}))).toEqual(Array(7).fill('none')));
  it('history cannot be edited', () => expect(normalizePermissions({history:'edit'}).history).toBe('read'));
  it('no hidden fields are serialized', () => { const c = newCharacter(); c.name='Secret'; c.notes=[{id:'n',at:'now',title:'Secret',text:'Private'}]; const dto=projectShared(c,normalizePermissions({primary:'read',history:'read'})); expect(dto).not.toHaveProperty('name'); expect(dto).not.toHaveProperty('inventory'); expect(dto).not.toHaveProperty('notes'); expect(dto).not.toHaveProperty('log'); expect(dto.primary).toEqual(c.primary); });
  it('read never grants edit', () => expect(canShareAction(normalizePermissions({notes:'read'}),'notes')).toBe(false));
  it('secondary exp needs edit of both coupled sections', () => { expect(canShareAction(normalizePermissions({secondary:'edit',primary:'read'}),'secondaryExp')).toBe(false); expect(canShareAction(normalizePermissions({secondary:'edit',primary:'edit'}),'secondaryExp')).toBe(true); });
  it('use requires inventory edit', () => {expect(canShareAction(normalizePermissions({inventory:'read'}),'use')).toBe(false);expect(canShareAction(normalizePermissions({inventory:'edit'}),'use')).toBe(true)});
  it('derived combat requires every dependency', () => {const p=normalizePermissions({bio:'read',primary:'read',secondary:'read',inventory:'read'});expect(canDeriveShared(p)).toBe(true);expect(canDeriveShared({...p,inventory:'none'})).toBe(false)});
  it('link expires after seven days', () => {expect(INVITE_LIFETIME_MS).toBe(604800000);expect(invitationUsable('pending',new Date(INVITE_LIFETIME_MS).toISOString(),INVITE_LIFETIME_MS,true)).toBe(false)});
  it('used and revoked links cannot be accepted', () => {expect(invitationUsable('accepted','2099-01-01',0,true)).toBe(false);expect(invitationUsable('revoked','2099-01-01',0,true)).toBe(false)});
  it('blocked accounts cannot accept', () => expect(invitationUsable('pending','2099-01-01',0,false)).toBe(false));
  it('sharing never accepts another owners image namespace', () => { expect(ownsImagePath('victim/item/image.png','owner')).toBe(false); expect(ownsImagePath('owner/item/image.png','owner')).toBe(true); expect(ownsImagePath('owner/../victim/image.png','owner')).toBe(false); });
  it('hidden identity prevents derived combat even with all stats visible', () => expect(canDeriveShared(normalizePermissions({primary:'read',secondary:'read',inventory:'read'}))).toBe(false));
});describe('skills permission', () => {
  it('skills hidden by default; effects split by section', async () => {
    const { newCharacter } = await import('./index');
    const c: any = { ...newCharacter(), skills: [{ id: 's' }], exhaustion: 7, activeEffects: [{ id: 'i', sourceType: 'item' }, { id: 'k', sourceType: 'skill' }] };
    const inv: any = projectShared(c, normalizePermissions({ inventory: 'read' }));
    expect(inv.skills).toBeUndefined(); expect(inv.activeEffects.map((a: any) => a.id)).toEqual(['i']);
    const sk: any = projectShared(c, normalizePermissions({ skills: 'read' }));
    expect(sk.exhaustion).toBe(7); expect(sk.inventory).toBeUndefined(); expect(sk.activeEffects.map((a: any) => a.id)).toEqual(['k']);
  });
  it('skill actions need skills edit', () => {
    expect(canShareAction(normalizePermissions({ skills: 'read' }), 'skills')).toBe(false);
    expect(canShareAction(normalizePermissions({ skills: 'edit' }), 'skills')).toBe(true);
  });
});
