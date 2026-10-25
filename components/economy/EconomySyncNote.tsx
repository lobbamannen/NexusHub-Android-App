import { useEffect, useState } from 'react';
import { pendingWrites } from '@/platform/outbox';
import { queuedEditMatches } from '@/lib/draft-scope.mjs';
export type EconomyDraftTarget = {path: string; id: string; kind?: string};
/** Small shared status for the two existing economy editors, not a second queue. */
export default function EconomySyncNote({target}: {target: EconomyDraftTarget}) {
    const [message,setMessage]=useState('');
    useEffect(()=>{
        let mounted=true;
        const update=async()=>{
            try {
                const writes=(await pendingWrites()).filter(item=>queuedEditMatches(item,'economy',target));
                if(mounted)setMessage(writes.length ? writes.some(item=>item.status==='conflict')
                    ? 'Konflikt i GitHub. Utkastet är kvar; ingen version skrivs över automatiskt.'
                    : 'Väntar på synk till GitHub. Sparförsöket finns på telefonen. Spara igen för att återförsöka, eller Avbryt för att kasta det.' : 'Utkast – inte sparat i GitHub.');
            }catch{if(mounted)setMessage('Kunde inte kontrollera väntande sparningar på telefonen.');}
        };
        void update();window.addEventListener('nexus-outbox-changed',update);
        return()=>{mounted=false;window.removeEventListener('nexus-outbox-changed',update);};
    },[target.path,target.id,target.kind]);
    return <p role="status" className="nh-eco-note">{message}</p>;
}
