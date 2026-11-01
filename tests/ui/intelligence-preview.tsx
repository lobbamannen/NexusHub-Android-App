import React from 'react';
import {createRoot} from 'react-dom/client';
import '@/app/globals.css';import '@/app/module-dashboards.css';import '@/app/chroma-materials.css';import '@/app/chroma-theme.css';import '@/src/android.css';
import NexusIntelligence from '@/components/intelligence/NexusIntelligence';
import NativeBackBridge from '@/components/NativeBackBridge';
let config={temperature:0.7,topP:0.9,backend:'CPU',contextSize:4096,maxOutputTokens:1024};
(window as any).Android={gemmaStatus:()=>JSON.stringify({imported:true,config}),gemmaLatestResult:()=> '{}',gemmaSaveProfile:(raw:string)=>{config=JSON.parse(raw);return '{}'}};
createRoot(document.getElementById('root')!).render(<div className="portal-shell nh-chroma-site" style={{padding:14,minHeight:'100vh'}}><NativeBackBridge/><button id="outside">Bakgrundskontroll</button><NexusIntelligence/></div>);
