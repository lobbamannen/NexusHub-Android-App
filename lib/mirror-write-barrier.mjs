/** Never replace a confirmed GitHub write with an older phone-side snapshot. */
export function createMirrorWriteBarrier(){
 const writes=new Map();
 return {
  record(path,commit){if(typeof path==='string'&&/^[a-f0-9]{40}$/.test(commit||''))writes.set(path,commit);},
  blocked(path,commit){const expected=writes.get(path);if(!expected)return false;if(expected===commit){writes.delete(path);return false;}return true;},
  async blockedAsync(path,commit,isAncestor){
   const expected=writes.get(path);
   if(!expected)return false;
   if(expected===commit){writes.delete(path);return false;}
   if(!commit||typeof isAncestor!=='function')return true;
   try{
    const reached=await isAncestor(expected,commit);
    if(writes.get(path)!==expected)return true;
    if(reached){writes.delete(path);return false;}
   }catch{/* Unknown ancestry never removes the write barrier. */}
   return true;
  },
 };
}
