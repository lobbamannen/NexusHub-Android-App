/** Cached catalog presence alone never proves that the current GitHub sync completed. */
export function homeSyncStatus(state){
 if(state.error)return {tone:'error',label:'Synkfel'};
 if(state.paused)return {tone:'pending',label:'Pausad'};
 if(state.running)return {tone:'pending',label:'Hämtar…'};
 if(state.checkedAt)return {tone:'ready',label:'Hämtad'};
 return {tone:'pending',label:'Ej verifierad'};
}
