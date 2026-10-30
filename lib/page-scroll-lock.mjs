const locks=new WeakMap();
/** Each mounted overlay owns a lease, including while its closing animation runs.
 * The first owner saves the page style; only the last release may restore it.
 * @param {HTMLElement|null|any} body
 */
export function lockPageScroll(body=globalThis.document?.body){
 if(!body?.style)return ()=>{};
 let state=locks.get(body);
 if(!state){
  const saved=['overflow','overflow-x','overflow-y'].map(property=>({property,value:body.style.getPropertyValue(property),priority:body.style.getPropertyPriority(property)}));
  state={owners:new Set(),saved};locks.set(body,state);body.style.setProperty('overflow','hidden');
 }
 const token={};state.owners.add(token);let released=false;
 return ()=>{
  if(released)return;released=true;state.owners.delete(token);
  if(state.owners.size)return;
  body.style.removeProperty('overflow');
  for(const {property,value,priority}of state.saved)if(value)body.style.setProperty(property,value,priority);
  locks.delete(body);
 };
}
