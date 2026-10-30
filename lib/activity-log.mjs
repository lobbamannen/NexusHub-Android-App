/** Structured domain history. Navigation and report bodies never belong here. */
export const activityCategories={inbox:'Inkorgen',ideas:'Idéer',todos:'Att göra',media:'Filmer & serier',stories:'Berättelser',calendar:'Kalender',documents:'Dokument',connections:'Kopplingar',economy:'Ekonomi',sync:'Synkronisering',settings:'Inställningar',system:'System'};
export const activityStatuses={local:'Sparat lokalt',pending:'Väntar',succeeded:'Klart',failed:'Misslyckat',conflict:'Konflikt',cancelled:'Avbrutet'};
const forbidden=/^(?:.*(?:authorization|token|password|secret|credential|api[_-]?key|private[_-]?key|signing[_-]?key).*|key|body|text|content|base64|original|payload)$/i;
const navigation=/(?:^|[._-])(?:navigation|navigate|page|screen|click|view)(?:[._-]|$)/i;
function text(value,max){return String(value??'').replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{10,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'[hemlighet dold]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);}
function clean(value,depth=0){
 if(depth>5)return '[detaljer begränsade]';if(value==null||typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string')return text(value,1000);
 if(Array.isArray(value))return value.slice(0,100).map(x=>clean(x,depth+1));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!forbidden.test(k)).slice(0,60).map(([k,v])=>[text(k,80),clean(v,depth+1)]));
 return undefined;
}
export function normalizeActivity(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ogiltig aktivitet.');
 const id=text(input.id,200),action=text(input.action,100),category=text(input.category,40),status=text(input.status,30),source=text(input.source||'app',60);
 if(!id||id!==input.id)throw Error('Ogiltigt aktivitets-ID.');
 if(!action||navigation.test(action))throw Error('Navigering loggas inte som aktivitet.');
 if(!Object.hasOwn(activityCategories,category))throw Error('Ogiltig aktivitetskategori.');
 if(!Object.hasOwn(activityStatuses,status))throw Error('Ogiltig aktivitetsstatus.');
 if(!input.at||!Number.isFinite(Date.parse(input.at)))throw Error('Ogiltig aktivitetstid.');
 const result={id,at:new Date(input.at).toISOString(),category,action,status,source};
 for(const [key,max] of [['objectType',80],['objectId',300],['title',300],['path',1600],['operationId',200]])if(input[key]!=null)result[key]=text(input[key],max);
 if(input.details&&typeof input.details==='object')result.details=clean(input.details);
 if(JSON.stringify(result).length>24000)result.details={omitted:true,reason:'Detaljerna översteg loggens storleksgräns. Händelsens identitet och resultat är bevarade.'};
 return result;
}
export function activityCursor(event){return JSON.stringify([event.at,event.id]);}
export function activityQuery(input={}){
 const q={limit:Math.max(1,Math.min(200,Math.floor(Number(input.limit)||50))),search:String(input.search||'').slice(0,300).toLocaleLowerCase('sv-SE')};
 for(const field of ['category','status'])if(input[field]){if(!Object.hasOwn(field==='category'?activityCategories:activityStatuses,input[field]))throw Error('Ogiltigt aktivitetsfilter.');q[field]=input[field];}
 for(const field of ['from','toExclusive'])if(input[field]){if(!Number.isFinite(Date.parse(input[field])))throw Error('Ogiltigt datumfilter.');q[field]=new Date(input[field]).toISOString();}
 if(input.cursor){try{const cursor=JSON.parse(input.cursor);if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||typeof cursor[1]!=='string'||!Number.isFinite(Date.parse(cursor[0]))||cursor[1].length>200)throw Error();q.cursor=cursor;}catch{throw Error('Ogiltig sidmarkör.');}}
 return q;
}
export function queryActivity(events,input={}){
 const q=activityQuery(input),unique=new Map();for(const event of events)if(!unique.has(event.id))unique.set(event.id,event);
 let matches=[...unique.values()].filter(e=>(!q.category||e.category===q.category)&&(!q.status||e.status===q.status)&&(!q.from||e.at>=q.from)&&(!q.toExclusive||e.at<q.toExclusive)&&(!q.search||JSON.stringify(e).toLocaleLowerCase('sv-SE').includes(q.search)));
 matches.sort((a,b)=>a.at<b.at?1:a.at>b.at?-1:a.id<b.id?1:a.id>b.id?-1:0);
 const total=matches.length;if(q.cursor)matches=matches.filter(e=>e.at<q.cursor[0]||(e.at===q.cursor[0]&&e.id<q.cursor[1]));
 const items=matches.slice(0,q.limit);return {items,nextCursor:matches.length>q.limit?activityCursor(items.at(-1)):null,total};
}
