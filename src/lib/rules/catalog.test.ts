import { describe, expect, it } from 'vitest';
import { catalogTemplate,catalogCopy,mayReview,mayBlock,catalogSearch } from './catalog';
import { addItem,emptyInventory,type Item } from './inventory';
const source:Item={id:'original',name:'Щит',category:'gear',slot:'offhand',quantity:3,description:'',rank:'S',notes:'private',history:[{at:'2026-01-01',text:'private'}],effects:[{id:'charge',kind:'ac',automation:'confirm',target:'',value:2,charges:5,remainingCharges:1}]};
describe('catalog copies',()=>{
 it('excludes private notes and history from a proposal',()=>{const t=catalogTemplate(source);expect(t).not.toHaveProperty('notes');expect(t).not.toHaveProperty('history');expect(source.notes).toBe('private');});
 it('removes remaining charges from a template',()=>{expect(catalogTemplate(source).effects?.[0]).not.toHaveProperty('remainingCharges');expect(source.effects?.[0]?.remainingCharges).toBe(1);});
 it('copies equipment as independent instances',()=>{const a=catalogCopy(source,'copy-a'),b=catalogCopy(source,'copy-b');const inv=addItem(addItem(emptyInventory(),a).inventory,b).inventory;expect(inv.items.map(i=>i.id)).toEqual(['copy-a','copy-b']);a.effects?.splice(0);expect(b.effects).toHaveLength(1);expect(source.effects).toHaveLength(1);});
 it('restores full charges for a fresh catalog copy',()=>{expect(catalogCopy(source,'copy').effects?.[0]?.remainingCharges).toBe(5);});
 it('catalog copy has quantity one',()=>{expect(catalogCopy(source,'copy').quantity).toBe(1);});
});
describe('moderation rules',()=>{
 it('only active administrators can review pending submissions',()=>{expect(mayReview(true,true,'pending',1,1)).toBe(true);expect(mayReview(true,false,'pending',1,1)).toBe(false);expect(mayReview(false,true,'pending',1,1)).toBe(false);expect(mayReview(true,true,'approved',1,1)).toBe(false);expect(mayReview(true,true,'rejected',1,1)).toBe(false);});
 it('stale revision cannot be reviewed',()=>{expect(mayReview(true,true,'pending',2,1)).toBe(false);});
 it('self-blocking is forbidden',()=>{expect(mayBlock('a','a',true,true,false,1)).toBe(false);});
 it('last administrator cannot be blocked',()=>{expect(mayBlock('a','b',true,true,true,0)).toBe(false);expect(mayBlock('a','b',true,true,true,1)).toBe(true);});
 it('ordinary and blocked accounts cannot block another account',()=>{expect(mayBlock('a','b',true,false,false,1)).toBe(false);expect(mayBlock('a','b',false,true,false,1)).toBe(false);});
});
it('catalog search validates ranks F to S and pages',()=>{expect(catalogSearch({rank:'S',page:2}).rank).toBe('S');expect(catalogSearch({rank:'Z',page:-1})).toMatchObject({rank:'all',page:1});});
