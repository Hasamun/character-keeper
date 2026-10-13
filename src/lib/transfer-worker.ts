import {parseTransferFiles} from './transfer-files';
self.onmessage=async(event:MessageEvent<File[]>)=>{
  try { self.postMessage({result:await parseTransferFiles(event.data)}); }
  catch(error){self.postMessage({error:error instanceof Error?error.message:'Не удалось прочитать файлы'});}
};