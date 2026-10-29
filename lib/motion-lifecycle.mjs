/** DOM updates run exactly once, even if visual capture is unsupported or fails.
 * @param {()=>any} update
 * @param {any} host
 * @param {(transition:any)=>void} onTransition
 */
export async function runTransition(update,host,onTransition=()=>{}){
 let applied=false,error,result;
 const once=()=>{if(applied){if(error)throw error;return result;}applied=true;try{return result=update();}catch(e){error=e;throw e;}};
 if(!host?.startViewTransition){once();return;}
 let transition;
 try{transition=host.startViewTransition(once);}catch(e){if(applied)throw error||e;once();return;}
 onTransition(transition);
 // ready may reject on skipped/overlapping captures, independently of a successful update.
 transition.ready?.catch(()=>{});
 await transition.updateCallbackDone;
}
/** Serialize DOM callbacks, allowing the next action to skip only the previous animation. */
export function createTransitionQueue(){let tail=Promise.resolve();return job=>{const next=tail.catch(()=>{}).then(job);tail=next;return next;};}
