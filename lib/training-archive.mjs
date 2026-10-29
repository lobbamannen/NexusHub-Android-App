const text=v=>typeof v==='string'?v.trim():'';
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)?Number(v):null;
export function monthPath(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Ogiltig månad.');return `Cortex/Data/Dagsloggar/${month.slice(0,4)}/${month}.json`;}
export function normalizeTrainingMonth(data,month,source){
 monthPath(month);if(!Array.isArray(data?.records))throw Error('Månadsfilen saknar läsbara dagsloggar.');
 const entries=[],warnings=[],seen=new Set();
 for(const r of data.records){
  const d=r?.data,date=d?.date;
  if(r?.deletedAt||d?.deletedAt)continue;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==month||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date){warnings.push('En post har ogiltigt datum.');continue;}
  const w=d?.jsonLog?.daily_master_log?.workout;if(w?.status!=='COMPLETED')continue;
  const id=text(r.id);if(!id){warnings.push('En post saknar identitet.');continue;}const key=id+'|'+date;if(seen.has(key))continue;seen.add(key);
  const title=text(w.title),exercises=(Array.isArray(w.exercises)?w.exercises:[]).filter(x=>x&&typeof x==='object').map((e,i)=>({key:text(e.canonical_name)||text(e.name)||String(i),name:text(e.name)||text(e.canonical_name)||'Namnlös övning',sets:(Array.isArray(e.sets)?e.sets:[]).filter(s=>s&&typeof s==='object').map((s,j)=>({index:j+1,count:number(s.count),reps:number(s.reps),weightKg:number(s.weight_kg),rir:number(s.rir)})),notes:[text(e.user_notes),text(e.scout_notes)].filter(Boolean)}));
  if(!title&&!exercises.length)continue;
  entries.push({date,recordId:id,passType:title.match(/^Pass\s+([123])\b/i)?.[1]||'other',title:title||'Träningspass',durationMinutes:number(w.duration_min),volumeKg:number(w.volume_kg),exercises,journal:{dailyWin:text(d.journal?.dailyWin),commentary:text(d.journal?.commentary),focusType:text(d.journal?.focusType)},source});
 }
 return {entries:entries.sort((a,b)=>a.date.localeCompare(b.date)||a.recordId.localeCompare(b.recordId)),warnings};
}
export function filterTraining(entries,{pass='all',exercise=''}={}){const q=exercise.trim().toLocaleLowerCase('sv');return entries.filter(e=>(pass==='all'||e.passType===pass)&&(!q||e.exercises.some(x=>(x.name+' '+x.key).toLocaleLowerCase('sv').includes(q))));}
