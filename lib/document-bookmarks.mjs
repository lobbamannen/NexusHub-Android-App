import { invalid } from './errors.mjs';
export const BOOKMARK_PATH = 'System/nexus-bookmarks.json';
export function bookmarkEntry(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw invalid('Ogiltig dokumentgenväg.');
    const repoKey = input.repoKey || 'databas';
    if (!['databas', 'plugins'].includes(repoKey))
        throw invalid('Okänt repository.');
    const path = input.path || null, copyId = input.copyId || null;
    if (path !== null && (typeof path !== 'string' || path.length > 1000 || path.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')))
        throw invalid('Ogiltig dokumentsökväg.');
    if (copyId !== null && (typeof copyId !== 'string' || !copyId || copyId.length > 200))
        throw invalid('Ogiltig kopiereferens.');
    if (!path && !copyId)
        throw invalid('Dokumentreferens saknas.');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 1000)
        throw invalid('Dokumenttitel saknas.');
    return { path, copyId, repoKey, title: input.title };
}
export function bookmarkKey(row) { return row.copyId ? 'copy:' + row.copyId : 'github:' + row.repoKey + ':' + row.path; }
export function validateBookmarks(input) {
    if (input?.schemaVersion !== 1 || !input.entries || typeof input.entries !== 'object' || Array.isArray(input.entries) || Object.keys(input.entries).length > 10000)
        throw invalid('Okänt format på dokumentgenvägar.');
    const entries = Object.create(null);
    for (const [key, row] of Object.entries(input.entries)) {
        const entry = bookmarkEntry(row);
        if (bookmarkKey(entry) !== key || typeof row.saved !== 'boolean' || !Number.isFinite(Date.parse(row.updatedAt)))
            throw invalid('Felaktig sparad dokumentgenväg.');
        entries[key] = { ...entry, saved: row.saved, updatedAt: row.updatedAt };
    }
    return { ...input, schemaVersion: 1, entries };
}
export function applyBookmarks(register, input, at) {
    const next = validateBookmarks(register);
    if (input?.action === 'set') {
        const entry = bookmarkEntry(input.entry);
        if (typeof input.value !== 'boolean')
            throw invalid('Ogiltig markering.');
        next.entries[bookmarkKey(entry)] = { ...entry, saved: input.value, updatedAt: at };
    }
    else if (input?.action === 'migrate') {
        if (!Array.isArray(input.entries) || input.entries.length > 200)
            throw invalid('För många dokumentgenvägar.');
        for (const raw of input.entries) {
            const entry = bookmarkEntry(raw), key = bookmarkKey(entry);
            if (!Object.hasOwn(next.entries, key))
                next.entries[key] = { ...entry, saved: true, updatedAt: at };
        }
    }
    else
        throw invalid('Okänd genvägsåtgärd.');
    return validateBookmarks(next);
}
