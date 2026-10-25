/** Layered back navigation shared by the Site and the installed Android wrapper. */
export function createBackDispatcher(){
 const handlers=new Map();let sequence=0;
 return {
  register(priority,handler){const id=++sequence;handlers.set(id,{priority,handler});return()=>{handlers.delete(id);};},
  back(){for(const {handler} of [...handlers.values()].sort((a,b)=>b.priority-a.priority)){if(handler())return true;}return false;}
 };
}
