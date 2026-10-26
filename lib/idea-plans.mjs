import { IDEA_ID } from './ideas.mjs';
export function validatePlanMetadata(value, ideaId) {
    if (!IDEA_ID.test(ideaId) || !value || value.schemaVersion !== 1 || value.ideaId !== ideaId)
        throw Error('Planpaketet måste använda originalidéns UUID.');
    if (typeof value.title !== 'string' || !value.title.trim() || typeof value.summary !== 'string' || !value.summary.trim())
        throw Error('Planpaketet saknar titel eller sammanfattning.');
    if (typeof value.preparedAt !== 'string' || !Number.isFinite(Date.parse(value.preparedAt)) || !/^[a-f0-9]{40}$/.test(value.sourceIdeaSha || ''))
        throw Error('Planpaketet saknar giltig planeringstid eller källversion.');
    return value;
}
