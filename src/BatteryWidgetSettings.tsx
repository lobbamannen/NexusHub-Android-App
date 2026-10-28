import React,{useState} from 'react';
import {BatteryCharging} from 'lucide-react';
import {nativeAvailable,nativeCall} from '@/lib/calendar/native-client';
export default function BatteryWidgetSettings(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="panel settings-panel"><h2><BatteryCharging size={18}/> Two Thumbs Battery</h2><p>Telefon och Galaxy Watch i en widget med exakt två rader. Lägg till den på låsskärmen via Good Lock / LockStar och ändra storleken där.</p><p className="small muted">Kräver NexusHub Battery på klockan. Här finns anslutning, uppdateringsintervall, nattpaus (20:00–06:00 som standard), bakgrund och lokal diagnostik.</p><button className="primary" type="button" disabled={busy||!nativeAvailable()} onClick={async()=>{setBusy(true);setError('');try{await nativeCall('battery.openSettings');}catch{setError('Widgetinställningarna kunde inte öppnas. Kontrollera att senaste APK är installerad.');}finally{setBusy(false);}}}>{busy?'Öppnar…':'Öppna batteriwidget'}</button>{!nativeAvailable()&&<p className="small muted">Tillgängligt i Android-appen.</p>}{error&&<p className="error-banner" role="alert">{error}</p>}</div>;
}
