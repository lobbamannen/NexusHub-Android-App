export const IDEA_STATUSES = { new: 'Ny', investigating: 'Undersöks', completed: 'Genomförd', dismissed: 'Avfärdad' };
export const IDEA_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function ideaPath(id) {
    if (typeof id !== 'string' || !IDEA_ID.test(id)) throw Error('Ogiltigt idé-ID.');
    return 'Ideer/' + id + '.json';
}
export function validateIdea(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) throw Error('Idéns format stöds inte.');
    ideaPath(value.id);
    if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 50000) throw Error('Skriv en idé, högst 50 000 tecken.');
    if (!Object.hasOwn(IDEA_STATUSES, value.status)) throw Error('Ogiltig idéstatus.');
    for (const key of ['createdAt', 'updatedAt']) {
        if (typeof value[key] !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value[key]) || !Number.isFinite(Date.parse(value[key]))) throw Error('Ogiltig tidsstämpel.');
    }
    if (value.updatedAt < value.createdAt) throw Error('Ändringstiden får inte vara före skapandet.');
    return value;
}
export function ideaContent(idea) { return JSON.stringify(validateIdea(idea), null, 2) + '\n'; }
// Compare all JSON fields, including future extensions, independent of key order.
export function sameIdea(a, b) {
    const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
    return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
