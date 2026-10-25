// Source-only grouping for module dashboards; never fabricates categories or counts.
export function databaseCategoryOverview(documents=[]){
 const entries=Array.isArray(documents)?documents.filter(d=>d&&d.module==='databas'&&!d.technical&&!d.asset):[];
 const byCategory=new Map();
 for(const entry of entries){
  const name=typeof entry.category==='string'?entry.category.trim():'';
  if(!name)continue;
  byCategory.set(name,(byCategory.get(name)||0)+1);
 }
 const categories=[...byCategory].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'sv'));
 return {count:entries.length,categories};
}
export function storyCategoryOverview(stories=[]){
 const items=Array.isArray(stories)?stories:[];
 const byCategory=new Map();
 for(const story of items){
  const name=typeof story?.category==='string'?story.category:'';
  if(!name)continue;
  byCategory.set(name,(byCategory.get(name)||0)+1);
 }
 const categories=[...byCategory.keys()].sort((a,b)=>a.localeCompare(b,'sv'));
 const counts=Object.fromEntries(byCategory);
 return {count:items.length,categories,counts,exactRatings:items.filter(story=>typeof story?.numericRating==='number'&&Number.isFinite(story.numericRating)).length};
}
