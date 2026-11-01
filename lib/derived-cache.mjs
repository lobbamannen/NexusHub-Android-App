/** Only values reproducible from verified originals may enter this cache. */
export const DERIVED_PREFIXES = Object.freeze([
 'connections:source:v1:', 'connections:extract:v3:', 'connections:extract:v4:', 'training:projection:v2:',
 'nexus-idea-retrieval:v2:doc:', 'nexus-idea-retrieval:v2:vector:', 'idea-relations:v4:',
]);
const META='derived-cache-meta:v1:';
const allowed=key=>typeof key==='string'&&DERIVED_PREFIXES.some(prefix=>key.startsWith(prefix));
const bytesOf=value=>new TextEncoder().encode(JSON.stringify(value)??'').byteLength;

export function createDerivedCache({get,set,remove,keys,maxBytes=64*1024*1024,now=Date.now}) {
 let tail=Promise.resolve();
 let inventory;
 const locked=work=>{const result=tail.then(work);tail=result.catch(()=>{});return result;};
 const validate=key=>{if(!allowed(key))throw Error('Protected data cannot enter the derived cache.');};
 async function loadInventory() {
  if(inventory)return;
  const next=new Map();
  for(const prefix of DERIVED_PREFIXES)for(const key of await keys(prefix)) {
   const meta=await get(META+key);
   // Values and optional recency metadata may be interrupted independently.
   // Measure the durable value rather than trusting a stale previous byte count.
   const value=await get(key);
   if(value!==undefined)next.set(key,{bytes:bytesOf(value),used:Number.isFinite(meta?.used)?meta.used:0});
  }
  // Recover metadata-only orphans after an interrupted deletion, once per process.
  for(const key of await keys(META))if(!next.has(key.slice(META.length)))await remove(key);
  inventory=next;
 }
 async function prune(limit=maxBytes) {
  await loadInventory();
  let size=[...inventory.values()].reduce((sum,item)=>sum+item.bytes,0);
  if(size<=limit)return size;
  const records=[...inventory].sort((a,b)=>a[1].used-b[1].used||a[0].localeCompare(b[0]));
  for(const [key,entry] of records) {
   if(size<=limit)break;
   // Values are disposable, but originals, snapshot blobs, journals, receipts,
   // decisions and deletion guards are outside the explicit namespace allowlist.
   await remove(key);inventory.delete(key);size-=entry.bytes;await remove(META+key);
  }
  return size;
 }
 return {
  get:key=>locked(async()=>{
   validate(key);await loadInventory();const value=await get(key);
   if(value!==undefined){
    const meta={bytes:bytesOf(value),used:now()};inventory.set(key,meta);
    try{await set(META+key,meta);}catch{/* Cache recency is optional. */}
   }else inventory.delete(key);
   await prune();
   return value;
  }),
  set:(key,value)=>locked(async()=>{
   validate(key);await loadInventory();await set(key,value);
   const meta={bytes:bytesOf(value),used:now()};inventory.set(key,meta);
   try{await set(META+key,meta);}catch{/* Missing metadata is rebuilt on startup. */}
   await prune();
  }),
  prune:(limit=maxBytes)=>locked(()=>prune(limit)),
 };
}
