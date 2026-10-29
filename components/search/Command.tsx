import React from 'react';
import {ArrowRight,Command as CommandIcon,Search} from 'lucide-react';
import {commandTargets,parseCommand} from '@/lib/commands.mjs';
import '../connected-modules.css';
export default function Command({query,onNavigate,onSearch}:{query:string;onNavigate:(view:string)=>void;onSearch:(q:string)=>void}){
 const result=parseCommand(query);const choices=commandTargets.filter(([,label])=>!query||label.toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));
 return <section className="nh-command" aria-label="Nexus Command"><div className="section-heading"><h2><CommandIcon size={21}/>Command</h2><small className="nh-source-caption">Sök eller öppna en modul</small></div>{query&&result.kind==='navigate'?<button className="nh-command-result" onClick={()=>onNavigate(result.view!)}><ArrowRight size={19}/><span><strong>Öppna {result.label}</strong><small>Tolkning: navigera till modulen</small></span></button>:query&&/^sök\s/i.test(query)?<button className="nh-command-result" onClick={()=>onSearch(result.query!)}><Search size={18}/><span><strong>{result.label}</strong><small>Sökning i befintligt innehåll</small></span></button>:null}<div className="nh-command-shortcuts">{choices.slice(0,query?8:6).map(([id,label])=><button className="secondary" key={id} onClick={()=>onNavigate(id)}>{label}<ArrowRight size={15}/></button>)}</div>{!query&&<p className="nh-source-caption">Skriv exempelvis ”öppna träning”, ”visa kopplingar” eller ”sök kunskap om Gemma”. Vanlig text söker som tidigare.</p>}</section>;
}
