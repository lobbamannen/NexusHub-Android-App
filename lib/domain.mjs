import { invalid } from './errors.mjs';
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MODULES = ['databas', 'mysterier', 'plugins', 'verktyg'];
export const RELATION_TYPES = ['relaterar', 'citerar', 'bygger på', 'motsäger', 'fördjupar'];
export function validateEntry(data) {
    const title = String(data.title ?? '').trim();
    if (!title || title.length > 500)
        throw invalid('Ange en titel (högst 500 tecken).');
    const module = data.module ?? 'databas';
    if (!MODULES.includes(module))
        throw invalid('Ogiltig avdelning.');
    const body = String(data.body ?? '');
    if (new TextEncoder().encode(body).length > 1800000)
        throw invalid('Texten är för stor. Bifoga den som originalfil.');
    const tags = Array.isArray(data.tags) ? data.tags : String(data.tags ?? '').split(',');
    return { title, body, module, category: String(data.category ?? 'Övrigt').trim().slice(0, 200) || 'Övrigt', kind: String(data.kind ?? 'Dokument').slice(0, 80), summary: String(data.summary ?? '').slice(0, 3000), tags: [...new Set(tags.map(x => String(x).trim()).filter(Boolean))].slice(0, 40), state: data.state === 'inkorg' ? 'inkorg' : 'klar' };
}
export function escapeLike(value) { return String(value).replace(/[\\%_]/g, '\\$&'); }
export function validateRelation(data) { if (!data.sourceId || !data.targetId || data.sourceId === data.targetId)
    throw invalid('Välj två olika poster.'); if (!RELATION_TYPES.includes(data.type))
    throw invalid('Ogiltig relationstyp.'); return { sourceId: data.sourceId, targetId: data.targetId, type: data.type, note: String(data.note ?? '').slice(0, 2000) }; }
export function readNavigation(hash) { return ['hem', 'sok', 'inkorg', 'graf', 'installningar', 'favoriter', 'papperskorg', 'arkiv', 'github', ...MODULES].includes(hash) ? hash : null; }
export function validateBackup(data) {
    if (data?.format !== 'nexus-backup' || data.schema !== 1)
        throw invalid('Ogiltig säkerhetskopia.');
    for (const table of ['entries', 'files', 'relations', 'versions', 'activity', 'settings'])
        if (!Array.isArray(data[table]))
            throw invalid('Saknad tabell: ' + table);
    const ids = new Set();
    for (const row of data.entries) {
        if (!row.id || ids.has(row.id))
            throw invalid('Saknat eller dubbelt post-ID.');
        ids.add(row.id);
        if (typeof row.body !== 'string')
            throw invalid('Dokumenttext saknas.');
        validateEntry({ ...row, tags: JSON.parse(row.tags) });
        if (!Array.isArray(JSON.parse(row.tags)))
            throw invalid('Felaktiga taggar.');
        for (const key of ['origin', 'state', 'created_at', 'updated_at'])
            if (typeof row[key] !== 'string')
                throw invalid('Saknat fält: ' + key);
        for (const key of ['version', 'favorite', 'deleted'])
            if (!Number.isInteger(row[key]))
                throw invalid('Felaktigt numeriskt fält: ' + key);
    }
    for (const r of data.relations) {
        if (!ids.has(r.source_id) || !ids.has(r.target_id))
            throw invalid('Relation till saknad post.');
        validateRelation({ sourceId: r.source_id, targetId: r.target_id, type: r.type, note: r.note });
    }
    for (const f of data.files)
        if (!f.id || !f.key || !f.name || !f.mime || !Number.isInteger(f.size) || !/^\w{64}$/.test(f.hash) || !f.origin || !f.created_at || (f.entry_id && !ids.has(f.entry_id)))
            throw invalid('Felaktig filmetadata.');
    for (const r of data.versions) {
        if (!r.id || !ids.has(r.entry_id) || !r.created_at)
            throw invalid('Felaktig historik.');
        JSON.parse(r.snapshot);
    }
    for (const r of data.settings) {
        if (!r.key)
            throw invalid('Felaktig inställning.');
        JSON.parse(r.value);
    }
    for (const r of data.activity)
        if (!r.id || !r.title || !r.action || !r.created_at)
            throw invalid('Felaktig aktivitet.');
    for (const table of ['files', 'relations', 'versions', 'activity', 'settings']) {
        const seen = new Set();
        for (const row of data[table]) {
            const key = table === 'settings' ? row.key : row.id;
            if (!key || seen.has(key))
                throw invalid('Dubbelt eller saknat ID i ' + table);
            seen.add(key);
        }
    }
    return data;
}
