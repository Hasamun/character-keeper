import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {parseCsv,itemsCsv,parseTransferFiles,makeArchive} from './transfer-files';
import {newCharacter} from './rules';
import {TRANSFER_LIMITS} from './rules/transfer';
import type {Item} from './rules/inventory';
describe('portable files',()=>{
 it('CSV preserves quotes, newlines, effects, requirements and formula-like text',()=>{const i:Item={id:'x',name:'=Название',category:'gear',quantity:1,description:'"Текст",\nстрока',notes:"'Заметка",effects:[{id:'e',kind:'ac',target:'',value:-2,automation:'manual',charges:5,remainingCharges:2}],requirements:[{stat:'Сила',min:3}]};const r=parseCsv(itemsCsv([i]));expect(r[0]).toEqual(i);});
 it('CSV omits nonportable image references',()=>expect(parseCsv(itemsCsv([{id:'x',name:'X',category:'misc',quantity:1,description:'',image:'foreign/x/a.png'}]))[0]).not.toHaveProperty('image'));
 it('reports invalid record separately in a bulk JSON',async()=>{const c=newCharacter();c.name='Тест';const r=await parseTransferFiles([new File([JSON.stringify([c,{name:'Ошибка',primary:{Сила:{level:11}}}])],'test.json')]);expect(r.records).toHaveLength(1);expect(r.errors).toHaveLength(1);});
 it('accepts legacy class and notes format',async()=>{const r=await parseTransferFiles([new File([JSON.stringify({name:'Старый',class:'Воин',notes:['Текст']})],'old.json')]);expect(r.errors).toHaveLength(0);expect(r.records[0]?.value.notes).toEqual(expect.arrayContaining([expect.objectContaining({text:'Текст'})]));});
 it('accepts item sets wrapper',async()=>{const r=await parseTransferFiles([new File([JSON.stringify({items:[{name:'Меч',category:'gear'}]})],'items.json')]);expect(r.records[0]?.kind).toBe('item');});
 it('rejects unsafe ZIP entry without inflating it',async()=>{const data=zipSync({'../escape.json':strToU8('{}')});const r=await parseTransferFiles([new File([data as BlobPart],'bad.zip')]);expect(r.records).toHaveLength(0);expect(r.errors).toHaveLength(1);});
 it('enforces 500 records per operation',async()=>{const r=await parseTransferFiles([new File([JSON.stringify(Array.from({length:501},()=>({name:'X',category:'misc'})))],'large.json')]);expect(r.records).toHaveLength(0);expect(r.errors[0]).toContain('500');});
 it('uses bounded archive capacity',()=>{expect(TRANSFER_LIMITS.expanded).toBe(100*1024*1024);expect(TRANSFER_LIMITS.entries).toBe(1000);});
 it('rejects unsafe output asset paths',async()=>{await expect(makeArchive([],new Map([['../a',new Blob(['x'])]]))).rejects.toThrow();});
});
