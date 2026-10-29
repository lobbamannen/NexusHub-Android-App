import {ideaDay} from './idea-numbers.mjs';
/** Number assignments are permanent history. Daily activity counts only extant idea files. */
export function existingIdeaNumbers(index,files){const paths=new Set(files.map(f=>f.path));const entries=index.entries.filter(e=>paths.has('Ideer/'+e.id+'.json')||paths.has('Ideer/Genomforda/'+e.id+'.json'));const dailyCounts={};for(const e of entries){if(!e.createdAt||!Number.isFinite(Date.parse(e.createdAt)))continue;const day=ideaDay(e.createdAt);dailyCounts[day]=(dailyCounts[day]||0)+1;}return {...index,entries,dailyCounts};}
/** Shared by the home dashboard and the native widget: additions on Stockholm's date. */
export function dailyWidgetSnapshot(activity,entries,now=new Date()){
 const day=ideaDay(now.toISOString());
 /** @type {Record<string,number>} */
 const counts={};
 const ideas=entries.filter(e=>e.createdAt&&Number.isFinite(Date.parse(e.createdAt))&&ideaDay(e.createdAt)===day).length;
 if(ideas>0)counts.ideas=ideas;
 if(activity?.day===day)for(const key of ['films','series','stories']){
  const count=activity.counts?.[key];if(Number.isSafeInteger(count)&&count>0)counts[key]=count;
 }
 return {day,counts};
}
