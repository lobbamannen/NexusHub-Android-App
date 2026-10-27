import {telemetry} from './telemetry';
import React, { useEffect, useRef, useState } from 'react';
import { createImageCache } from '@/lib/image-cache.mjs';

const sharedImages=createImageCache({
  load:async(url:string)=>{const response=await fetch(url);if(!response.ok)throw Error('Bilden kunde inte hämtas.');return response.blob();},
  create:(blob:Blob)=>URL.createObjectURL(blob),
  revoke:(url:string)=>URL.revokeObjectURL(url),
});

/** Transport adapter only: the original image element, classes and layout stay unchanged. */
export function useLocalImage(url: string, lazy = false) {
  const element = useRef<HTMLImageElement>(null);
  const [state, setState] = useState({ url: '', source: '', error: false });
  useEffect(() => {
    let active = true,handle:ReturnType<typeof sharedImages.acquire>|null=null;
    const load = () => {const began=performance.now();handle=sharedImages.acquire(url);void handle.source.then((source:string)=>{
      if(active){const elapsed=performance.now()-began;if(elapsed>=500)telemetry('image_load_slow',{screen_group:'library',duration_bucket:elapsed<1000?'0_5to1s':elapsed<=3000?'1to3s':'over3s'});setState({url,source,error:false});}
    }).catch(()=>{if(active)setState({url,source:'',error:true});});};
    let observer: IntersectionObserver | undefined;
    if (lazy && element.current && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => {if(entries.some(entry=>entry.isIntersecting)){observer?.disconnect();load();}}, {rootMargin:'300px'});
      observer.observe(element.current);
    } else load();
    return () => {active=false;observer?.disconnect();handle?.release();};
  }, [url,lazy]);
  return {...(state.url === url ? state : { url, source: '', error: false }), ref:element};
}

export function LocalImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const image = useLocalImage(String(props.src || ''));
  return <img {...props} src={image.source || undefined} />;
}

function filename(response: Response, fallback: string) {
  const disposition = response.headers.get('content-disposition') || '';
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  try { if (utf8) return decodeURIComponent(utf8); } catch { /* use safe fallback */ }
  return disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
}

async function deliverFile(anchor: HTMLAnchorElement) {
  const url = anchor.href;
  const response = await fetch(url);
  if (!response.ok) { const data = await response.json().catch(() => null); throw Error(data?.error || 'Originalfilen kunde inte hämtas.'); }
  const blob = await response.blob();
  const name = filename(response, anchor.download || new URL(url).searchParams.get('path')?.split('/').pop() || 'nexus-export.json');
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const mime = ({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',json:'application/json',md:'text/markdown',txt:'text/plain'} as Record<string,string>)[ext] || blob.type || 'application/octet-stream';
  const native = window.Android as any;
  if (native?.saveFile) {
    if (blob.size > 64 * 1024 * 1024) throw Error('Filen är större än 64 MB.');
    const base64 = await new Promise<string>((resolve,reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob);
    });
    const inline = new URL(url).searchParams.get('inline') === '1';
    (inline && native.openFile ? native.openFile : native.saveFile).call(native, name, mime, base64);
  } else {
    const objectUrl = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = objectUrl; link.download = name;
    originalClick.call(link); setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }
}

const originalClick = HTMLAnchorElement.prototype.click;
const localFile = (anchor: HTMLAnchorElement) => {
  const url = new URL(anchor.href, location.href);
  return url.origin === location.origin && /^\/api\/(portal\/original|files\/[^/]+|export)(?:\/|$)/.test(url.pathname) || url.protocol === 'blob:' && !!window.Android;
};
let installed = false;
export function installResourceHandling() {
  if (installed) return; installed = true;
  const run = (anchor: HTMLAnchorElement) => { void deliverFile(anchor).catch(error => window.alert(error.message || 'Filen kunde inte öppnas.')); };
  document.addEventListener('click', event => {
    const anchor = (event.target as Element | null)?.closest?.('a');
    if (anchor && localFile(anchor)) { event.preventDefault(); event.stopPropagation(); run(anchor); }
  }, true);
  // Existing JSON export uses a detached anchor, whose click never reaches document.
  HTMLAnchorElement.prototype.click = function () { if (localFile(this)) run(this); else originalClick.call(this); };
}
