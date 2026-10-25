/**
 * Navigation taxonomy only. Original GitHub genres remain untouched.
 * The first source genre determines the primary browse group.
 */
export const GENRE_GROUPS=[
 {id:'dokumentar',label:'Dokumentär & fakta',genres:['Dokumentär','Historia','Samhälle','Biografi']},
 {id:'kriminal',label:'Kriminal & mysterier',genres:['Kriminal','Brott','True crime','Mysterium','Mystery','Mysterie','Thriller']},
 {id:'reality',label:'Reality & underhållning',genres:['Reality','Reality TV','Underhållning']},
 {id:'skrack',label:'Skräck & paranormalt',genres:['Skräck','Horror','Paranormalt']},
 {id:'scifi',label:'Science fiction & dystopi',genres:['Science fiction','Postapokalyptiskt','Dystopi']},
 {id:'action',label:'Action & äventyr',genres:['Action','Äventyr','Action och äventyr']},
 {id:'fantasy',label:'Fantasy',genres:['Fantasy']},
 {id:'drama',label:'Drama & romantik',genres:['Drama','Romantik','Vänskap']},
 {id:'komedi',label:'Komedi & familj',genres:['Komedi','Familj','Animation','Musikal']},
 {id:'natur',label:'Natur & resor',genres:['Natur','Djur','Resor']},
 {id:'livsstil',label:'Sport & livsstil',genres:['Sport','Hälsa','Arbete','Mat och bakning']},
 {id:'ovrigt',label:'Övriga genrer & format',genres:['Kortfilm']}
];
const byGenre=new Map();
for(const group of GENRE_GROUPS){
 for(const genre of group.genres){
  if(byGenre.has(genre))throw new Error('Genre har flera huvudgrupper: '+genre);
  byGenre.set(genre,group.id);
 }
}
export const categoryForGenre=genre=>byGenre.get(genre)||'ovrigt';
export const matchesGenreGroup=(entry,id)=>Array.isArray(entry?.genres)&&typeof entry.genres[0]==='string'&&!!entry.genres[0].trim()&&categoryForGenre(entry.genres[0].trim())===id;
/** The first registered genre selects one primary group. */
export function groupedGenreOptions(entries=[]){
 const groups=new Map();
 for(const g of GENRE_GROUPS)groups.set(g.id,{id:'genregroup:'+g.id,label:g.label,count:0,children:new Map()});
 for(const entry of Array.isArray(entries)?entries:[]){
  const genres=Array.isArray(entry?.genres)?entry.genres:[];
  if(typeof genres[0]!=='string'||!genres[0].trim())continue;
  const group=groups.get(categoryForGenre(genres[0].trim()));
  group.count++;
  for(const name of new Set(genres.filter(g=>typeof g==='string'&&g.trim()).map(g=>g.trim())))
   group.children.set(name,(group.children.get(name)||0)+1);
 }
 return [...groups.values()].filter(g=>g.count>0).map(g=>({
  id:g.id,label:g.label,count:g.count,
  children:[...g.children].map(([name,count])=>({id:'genre:'+name,label:name,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'sv'))
 })).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'sv'));
}
