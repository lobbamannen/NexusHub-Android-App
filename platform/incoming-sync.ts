import {hasGithubToken} from './env';
import {syncIncoming,incomingSyncRunning} from './incoming-store';
let started=false;
export function startIncomingSync(){if(started)return;started=true;
 let timer:number|undefined;
 const wake=()=>{if(incomingSyncRunning()||!hasGithubToken())return;clearTimeout(timer);timer=window.setTimeout(()=>void syncIncoming(),600);};
 for(const event of ['online','nexus-credentials-changed','nexus-incoming-changed','nexus-github-changed'])window.addEventListener(event,wake);
 document.addEventListener('visibilitychange',wake);
 // Foreground fallback also resumes pending operations after an interrupted app session.
 window.setInterval(wake,60000);wake();
}
