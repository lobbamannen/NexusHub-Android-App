import {validateIdea} from './ideas.mjs';
/** Prepare an explicit decision, never a force-write. The caller backs up both inputs first. */
export function resolvedIdeaDraft(local,remote,choice,at){
 validateIdea(local.idea);validateIdea(remote.idea);
 if(local.idea.id!==remote.idea.id||!['merge','local','github'].includes(choice)||!/^[a-f0-9]{40}$/.test(remote.sha||''))throw Error('Versionerna hör inte till samma idé.');
 if(choice==='github')return remote;
 const text=choice==='local'||local.idea.text===remote.idea.text?local.idea.text:'GitHub-version:\n'+remote.idea.text+'\n\nMin lokala version:\n'+local.idea.text;
 if(text.length>50000)throw Error('De två texterna blir längre än 50 000 tecken. Välj en version; båda finns kvar i säkerhetskopian.');
 const idea={...remote.idea,text,status:local.idea.status,updatedAt:at};validateIdea(idea);
 return {sha:remote.sha,idea};
}
