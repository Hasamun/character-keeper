import {describe,it,expect} from 'vitest';
import {newCharacter} from './index';
import {cloneCharacter,validateRecord,safeArchivePath,duplicateHint} from './transfer';
describe('transfer rules',()=>{
 it('preserves character format and concrete base experience',()=>{const c=newCharacter();c.name='Тест';c.primary['Сила']={level:2,subIndex:3,progress:17};expect(validateRecord(c).value).toEqual({...c,activeEffects:[]});});
 it('rejects out of bounds levels instead of clamping',()=>{const c=newCharacter();c.name='Тест';c.primary['Сила']={level:11,subIndex:0,progress:0};expect(()=>validateRecord(c)).toThrow();});
 it('rejects fractional progress',()=>{const c=newCharacter();c.name='Тест';c.primary['Сила']={level:0,subIndex:0,progress:1.5};expect(()=>validateRecord(c)).toThrow();});
 it('remaps equipment and effect references without restoring charges',()=>{const c=newCharacter();c.name='Тест';const effect={id:'e',kind:'ac' as const,target:'',value:2,automation:'confirm' as const,charges:5,remainingCharges:2};c.inventory.items=[{id:'s',name:'Меч',category:'gear',slot:'weapon',quantity:1,description:'',effects:[effect]}];c.inventory.weaponSets[0].main='s';c.activeEffects=[{id:'a',sourceItemId:'s',sourceName:'Меч',equipmentBound:true,effect}];const x=cloneCharacter(c,'copy');expect(x.id).toBe('copy');expect(x.inventory.weaponSets[0].main).toBe(x.inventory.items[0]?.id);expect(x.inventory.items[0]?.id).not.toBe('s');expect(x.activeEffects?.[0]?.effect.id).toBe(x.inventory.items[0]?.effects?.[0]?.id);expect(x.activeEffects?.[0]?.effect.remainingCharges).toBe(2);});
 it('rejects missing equipped items',()=>{const c=newCharacter();c.name='Тест';c.inventory.equipped.ring1='missing';expect(()=>validateRecord(c)).toThrow('отсутствующий');});
 it('permits standalone effects after consumed source disappears',()=>{const c=newCharacter();c.name='Тест';c.activeEffects=[{id:'a',sourceItemId:'gone',sourceName:'Зелье',equipmentBound:false,effect:{id:'e',kind:'ac',target:'',value:2,automation:'manual'}}];expect(validateRecord(c).kind).toBe('character');});
 it.each(['../x','/x','a/../b','a\\b','a:b','a//b'])('rejects unsafe ZIP entry %s',p=>expect(safeArchivePath(p)).toBe(false));
 it('accepts a safe asset',()=>expect(safeArchivePath('images/a.webp')).toBe(true));
 it('rejects external image fetch references',()=>expect(()=>validateRecord({name:'Меч',category:'gear',image:'https://example.org/x.jpg'})).toThrow());
 it('detects repeats without deleting them',()=>{const c=newCharacter();c.name='Тест';const r=validateRecord(c);expect(duplicateHint(r,[c],[],[r])).toHaveLength(2);});
 it('rejects charge restoration beyond maximum',()=>expect(()=>validateRecord({name:'Меч',category:'gear',effects:[{kind:'ac',charges:2,remainingCharges:3}]})).toThrow());
});
