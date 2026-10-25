/** Restore the list after its content has rendered, including asynchronously loaded lists. */
export function restoreListScroll(top:number){
 const started=performance.now();let cancelled=false;
 const cancel=()=>{cancelled=true;};
 window.addEventListener('touchstart',cancel,{once:true,passive:true});window.addEventListener('wheel',cancel,{once:true,passive:true});
 const restore=()=>{if(cancelled||document.documentElement.scrollHeight>=top+window.innerHeight-2||performance.now()-started>5000){if(!cancelled)window.scrollTo(0,top);window.removeEventListener('touchstart',cancel);window.removeEventListener('wheel',cancel);return;}requestAnimationFrame(restore);};
 requestAnimationFrame(()=>requestAnimationFrame(restore));
}
