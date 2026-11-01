/** Retry an unfinished identical mutation; a completed identical save is a new intent. */
export function pendingIntentFor(pending,fingerprint){
 return pending.find(row=>row?.fingerprint===fingerprint||(!row?.fingerprint&&row?.id===fingerprint))||null;
}
export function newIntentId(fingerprint,hasHistoricalReceipt,makeId){
 return hasHistoricalReceipt?makeId():fingerprint;
}
