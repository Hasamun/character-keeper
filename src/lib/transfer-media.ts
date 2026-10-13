import {supabase} from '@/integrations/supabase/client';
import {uploadItemImage,IMAGE_TYPES,MAX_IMAGE_BYTES} from './item-images';
import {ownsImagePath} from './rules/sharing';
import {deriveCharacter} from './rules/derived';
import {PRIMARY_STAT_NAMES,type Character} from './rules';
import {CATEGORY_LABELS,type Item} from './rules/inventory';
import {effectLabel} from './rules/items';
import {makeArchive} from './transfer-files';

async function userId(){const r=await supabase.auth.getUser();if(!r.data.user)throw new Error('Нужно войти');return r.data.user.id;}
async function checkedImage(file:File){if(!IMAGE_TYPES.includes(file.type)||file.size>MAX_IMAGE_BYTES)throw new Error('Только PNG, JPEG или WebP до 10 МБ');const img=await createImageBitmap(file);if(img.width*img.height>40000000){img.close();throw new Error('Слишком большое разрешение изображения');}img.close();}
export async function portableArchive(records:(Character|Item)[],progress:(s:string)=>void,cancel:()=>boolean) {
 const owner=await userId();const copies=structuredClone(records);const assets=new Map<string,Blob>();const paths=new Map<string,string>();let idx=0;
 for(const r of copies){const items='inventory' in r?r.inventory.items:[r];for(const i of items)for(const field of ['image','thumb'] as const){if(cancel())throw new Error('Операция отменена');const path=i[field];if(!path)continue;
 if(!ownsImagePath(path,owner))throw new Error(`Недоступная картинка «${i.name}»: используйте собственное изображение`);
 let dest=paths.get(path);if(!dest){progress(`Изображение ${++idx}: ${i.name}`);const f=await supabase.storage.from('item-images').download(path);if(f.error||!f.data)throw new Error(`Не удалось включить картинку «${i.name}». Полная копия не создана`);if(!IMAGE_TYPES.includes(f.data.type)||f.data.size>MAX_IMAGE_BYTES)throw new Error('Недопустимое изображение');dest=`images/${idx}.${f.data.type.split('/')[1]}`;assets.set(dest,f.data);paths.set(path,dest);}i[field]='asset:'+dest;
 }}progress('Упаковка архива');return makeArchive(copies,assets);
}
export async function prepareImportedImages(items:Item[],assets:Map<string,File>,omit:boolean,uploaded:string[]) {
 const owner=await userId();
 for(const i of items){const original=i.image??i.thumb;
 if(!original)continue;if(omit){delete i.image;delete i.thumb;continue;}
 let file:File;
 if(original.startsWith('asset:')){const f=assets.get(original.slice(6));if(!f)throw new Error('Изображение отсутствует в архиве');file=f;}
 else {if(!ownsImagePath(original,owner))throw new Error('Чужая картинка: загрузите ZIP с файлами или выберите перенос без картинок');const r=await supabase.storage.from('item-images').download(original);if(r.error||!r.data)throw new Error('Картинка недоступна');file=new File([r.data],'image',{type:r.data.type});}
 await checkedImage(file);
 const uploadedImage=await uploadItemImage(i.id,file);uploaded.push(uploadedImage.image,uploadedImage.thumb);i.image=uploadedImage.image;i.thumb=uploadedImage.thumb;
 // The thumbnail is regenerated from the original and never imports an unchecked foreign path.
 }
}
export async function cleanupImportedImages(paths:string[]){if(paths.length)await supabase.storage.from('item-images').remove(paths);}
export async function attachImage(item:Item,file:File,uploaded:string[]){await checkedImage(file);const r=await uploadItemImage(item.id,file);uploaded.push(r.image,r.thumb);item.image=r.image;item.thumb=r.thumb;}
export async function avatarImage(file:File){await checkedImage(file);const {resizeImage}=await import('./storage');return resizeImage(file);}
export async function cardPng(value:Character|Item):Promise<Blob>{
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1320;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось создать карточку');
 const css=getComputedStyle(document.documentElement);const color=(token:string)=>css.getPropertyValue(token).trim();
 ctx.fillStyle=color('--background');ctx.fillRect(0,0,1000,1320);ctx.fillStyle=color('--primary');ctx.font='bold 46px Georgia';
 const wrap=(s:string,x:number,y:number,width:number,line=42)=>{let row='';for(const word of s.split(/\s+/)){if(ctx.measureText(row+word).width>width&&row){ctx.fillText(row,x,y);y+=line;row='';}let w=word;while(ctx.measureText(w).width>width){let cut=w.length-1;while(cut>1&&ctx.measureText(w.slice(0,cut)).width>width)cut--;ctx.fillText(row+w.slice(0,cut),x,y);y+=line;row='';w=w.slice(cut);}row+=w+' ';}ctx.fillText(row,x,y);return y+line;};
 let y=wrap(value.name,60,85,880,54);ctx.font='24px Georgia';ctx.fillStyle=color('--muted-foreground');y=wrap('inventory' in value?`${value.race} · ${value.characterClass}`:`Ранг ${value.rank??'F'} · ${value.subtype??CATEGORY_LABELS[value.category]}`,60,y+10,880,34);
 const path='inventory' in value?value.avatar:value.image;let blobUrl:string|undefined;
 if(path){try{let src=path;if(!path.startsWith('data:')){const owner=await userId();if(!ownsImagePath(path,owner))throw new Error('Изображение недоступно');const f=await supabase.storage.from('item-images').download(path);if(f.error||!f.data)throw new Error('Изображение недоступно');blobUrl=URL.createObjectURL(f.data);src=blobUrl;}const img=new Image();img.src=src;await img.decode();const k=Math.min(880/img.width,430/img.height);ctx.drawImage(img,60+(880-img.width*k)/2,y+15,img.width*k,img.height*k);y+=img.height*k+45;}finally{if(blobUrl)URL.revokeObjectURL(blobUrl);}}
 ctx.fillStyle=color('--foreground');ctx.font='27px Georgia';
 if('inventory' in value){const d=deriveCharacter(value);y=wrap(`HP ${d.hp}     КБ ${d.ac}`,60,y+20,880);for(const stat of PRIMARY_STAT_NAMES)y=wrap(`${stat}: ${d.primary[stat]}`,60,y+5,880,36);}
 else{y=wrap(value.description.slice(0,500),60,y+20,880,36);if(value.weapon)y=wrap(`Урон ${value.weapon.damage} · ${value.weapon.damageType}`,60,y+10,880,36);if(value.armor)y=wrap(`КБ +${value.armor.ac}`,60,y+10,880,36);for(const e of (value.effects??[]).slice(0,5)){if(y>1180)break;y=wrap(effectLabel(e),60,y+8,880,34);}}
 ctx.fillStyle=color('--muted-foreground');ctx.font='22px Georgia';ctx.fillText('Летопись героев · '+new Date().toLocaleDateString('ru-RU'),60,1280);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Не удалось создать PNG')),'image/png'));
}
