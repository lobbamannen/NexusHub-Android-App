import {createDerivedCache} from '@/lib/derived-cache.mjs';
import {durableGet,durableSet,durableDelete,durableKeys} from './local-store';

const cache=createDerivedCache({get:durableGet,set:durableSet,remove:durableDelete,keys:durableKeys});
export async function derivedGet<T>(key:string):Promise<T|undefined>{return cache.get(key) as Promise<T|undefined>;}
export async function derivedSet(key:string,value:unknown):Promise<void>{
 try {await cache.set(key,value);}
 catch(error) {
  // Optional derived state must not lose or block an otherwise valid original.
  if(!(error instanceof DOMException)||error.name!=='QuotaExceededError')throw error;
  await cache.prune(48*1024*1024);
 }
}
