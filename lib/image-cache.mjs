/** Deduplicate poster downloads and retain a bounded set of decoded object URLs. */
export function createImageCache({load,create,revoke,maxBytes=32*1024*1024,maxEntries=48}){
 const items=new Map();let bytes=0;
 function trim(){
   while(bytes>maxBytes||items.size>maxEntries){
     const victim=[...items].find(([,row])=>row.references===0&&!row.loading);
     if(!victim)break;
     const [key,row]=victim;items.delete(key);bytes-=row.size||0;if(row.url)revoke(row.url);
   }
 }
 return {acquire(key){
   let row=items.get(key);
   if(!row){
     row={references:0,loading:true,url:'',size:0,source:null};items.set(key,row);
     row.source=Promise.resolve().then(()=>load(key)).then(blob=>{
       row.url=create(blob);row.size=blob.size||0;bytes+=row.size;row.loading=false;trim();return row.url;
     }).catch(error=>{row.loading=false;if(items.get(key)===row)items.delete(key);throw error;});
   }
   items.delete(key);items.set(key,row);row.references++;
   let released=false;
   return {source:row.source,release(){if(released)return;released=true;row.references--;trim();}};
 }};
}
