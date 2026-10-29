import {retainLocalImage} from '@/platform/resources';
import {flushSync} from 'react-dom';
import {runTransition,createTransitionQueue} from './motion-lifecycle.mjs';
import './navigation-motion.css';
type Poster={kind:string;key:string};
const queue=createTransitionQueue();
let active:any=null,clearActive:(()=>void)|null=null;
let preferred:HTMLElement|null=null;
export function rememberMotionPoster(node:HTMLElement){preferred=node;}
function posterNode(poster?:Poster,largest=false){
 if(!poster)return null;
 const candidates=Array.from(document.querySelectorAll<HTMLElement>('[data-nexus-poster]')).filter(el=>el.dataset.nexusPoster===poster.key&&el.dataset.posterKind===poster.kind&&el.getBoundingClientRect().width>0);
 if(!largest){if(preferred&&candidates.includes(preferred))return preferred;const selected=candidates.find(el=>document.activeElement?.contains(el));if(selected)return selected;}
 return candidates.sort((a,b)=>{const area=(el:HTMLElement)=>{const r=el.getBoundingClientRect();return r.width*r.height;};return largest?area(b)-area(a):area(a)-area(b);})[0]||null;
}
/** Called only after navigation guards have allowed the update. */
async function performMotion(update:()=>void,kind:'forward'|'back'|'detail'='forward',poster?:Poster,scrollTop?:number){
 active?.skipTransition();clearActive?.();active=null;clearActive=null;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduced||!document.startViewTransition){flushSync(update);if(scrollTop!==undefined)window.scrollTo(0,scrollTop);return;}
 const source=posterNode(poster),sourceUrl=(source as HTMLImageElement|null)?.currentSrc,lease=source?.dataset.posterUrl?retainLocalImage(source.dataset.posterUrl):null,touched=new Set<HTMLElement>();let done=false;
 const name=(node:HTMLElement|null)=>{if(node&&!done){node.style.viewTransitionName='nexus-selected-poster';touched.add(node);}};
 const cleanup=()=>{if(done)return;done=true;lease?.release();for(const node of touched)node.style.removeProperty('view-transition-name');if(document.documentElement.dataset.nexusMotion===kind)delete document.documentElement.dataset.nexusMotion;};
 let captured=false;name(source);document.documentElement.dataset.nexusMotion=kind;
 try{await runTransition(()=>{flushSync(update);if(scrollTop!==undefined)window.scrollTo(0,scrollTop);const destination=posterNode(poster,true);if(source&&source!==destination)source.style.removeProperty('view-transition-name');if(sourceUrl&&destination instanceof HTMLImageElement&&!destination.getAttribute('src'))destination.src=sourceUrl;name(destination);},document,(transition:any)=>{
  captured=true;active=transition;clearActive=cleanup;transition.finished.catch(()=>{}).finally(()=>{cleanup();if(active===transition){active=null;clearActive=null;}});
 });if(!captured)cleanup();}catch(error){cleanup();throw error;}finally{preferred=null;}
}

export function navigateMotion(update:()=>void,kind:'forward'|'back'|'detail'='forward',poster?:Poster,scrollTop?:number):Promise<void>{
 return queue(()=>performMotion(update,kind,poster,scrollTop));
}
