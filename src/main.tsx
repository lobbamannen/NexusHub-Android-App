import '@/app/globals.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Portal from '@/app/portal';
import NexusBrandMark from '@/components/NexusBrandMark';
import MaterialDefinitions from '@/components/home/MaterialDefinitions';
import { TokenForm } from './AndroidSettings';
import { initializeStorage } from '@/platform/local-store';
import { hasGithubToken } from '@/platform/env';
import { installLocalApi } from '@/platform/api';
import { installResourceHandling } from '@/platform/resources';
import './android.css';
import { startReplicaSync } from '@/platform/replica-sync';

function App() {
  const [connected,setConnected]=useState(hasGithubToken());
  useEffect(()=>{ const update=()=>setConnected(hasGithubToken());window.addEventListener('nexus-credentials-changed',update);return()=>window.removeEventListener('nexus-credentials-changed',update);},[]);
  return connected ? <Portal/> : <div className="portal-shell nh-chroma-site nh-locked-home android-onboarding"><MaterialDefinitions/><main><div className="panel settings-panel"><NexusBrandMark/><h1>Nexus Hub</h1><TokenForm initial onConnected={()=>setConnected(true)}/></div></main></div>;
}

async function start() {
  await initializeStorage(); installLocalApi(); installResourceHandling();
  createRoot(document.getElementById('root')!).render(<App/>);
  startReplicaSync();

}
void start().catch(error=>{
  const root=document.getElementById('root')!;
  root.textContent='Nexus Hub kunde inte öppna telefonens lagring. '+(error instanceof Error?error.message:String(error));
});
