import {ideaDay} from './idea-numbers.mjs';
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
