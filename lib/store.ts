import { env } from '@/platform/env';
import { validateEntry, escapeLike, validateRelation } from './domain.mjs';
export const db = () => { if (!env.DB)
    throw Error('Databasen är inte ansluten.'); return env.DB; };
export const bucket = () => { if (!env.BUCKET)
    throw Error('Fillagringen är inte ansluten.'); return env.BUCKET; };
export const now = () => new Date().toISOString();
export async function sha256(bytes: ArrayBuffer | Uint8Array) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function hydrate(row: any) { return row ? { ...row, tags: JSON.parse(row.tags || '[]'), favorite: !!row.favorite, deleted: !!row.deleted } : row; }
export async function log(action: string, title: string, entryId: string | null = null) { await db().prepare('INSERT INTO activity(id,entry_id,title,action,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), entryId, title, action, now()).run(); }
export async function list(params: URLSearchParams) {
    const where = ['deleted = ?'];
    const args: any[] = [params.get('trash') === '1' ? 1 : 0];
    for (const [field, key] of [['module', 'module'], ['category', 'category'], ['state', 'state'], ['kind', 'kind']] as const) {
        const v = params.get(key);
        if (v) {
            where.push(`${field} = ?`);
            args.push(v);
        }
    }
    if (params.get('home') === '1') {
        where.push('kind <> ? AND category <> ?');
        args.push('Nyhet', 'Nyhetsarkiv');
    }
    if (params.get('favorite') === '1')
        where.push('favorite = 1');
    const q = (params.get('q') || '').trim().slice(0, 200);
    for (const word of q.split(/\s+/).filter(Boolean).slice(0, 12)) {
        where.push("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')");
        const v = '%' + escapeLike(word) + '%';
        args.push(v, v, v);
    }
    const w = where.join(' AND '), limit = Math.max(1, Math.min(100, Number(params.get('limit')) || 30)), offset = Math.max(0, Number(params.get('offset')) || 0);
    const count = await db().prepare('SELECT count(*) as n FROM entries WHERE ' + w).bind(...args).first<any>();
    const { results } = await db().prepare('SELECT id,title,summary,module,category,kind,tags,origin,source_path,source_sha,state,version,favorite,deleted,created_at,updated_at,substr(body,1,260) as excerpt FROM entries WHERE ' + w + ' ORDER BY favorite DESC, updated_at DESC, title ASC LIMIT ? OFFSET ?').bind(...args, limit, offset).all();
    return { entries: results.map(hydrate), total: count.n, limit, offset };
}
export async function read(id: string) {
    const entry = hydrate(await db().prepare('SELECT * FROM entries WHERE id=?').bind(id).first());
    if (!entry)
        throw Object.assign(Error('Posten finns inte.'), { status: 404 });
    const { results: files } = await db().prepare("SELECT f.*, (SELECT value FROM settings WHERE key='github_file:' || f.id) as github_status FROM files f WHERE entry_id=?").bind(id).all();
    const { results: relations } = await db().prepare('SELECT r.*, e.title as target_title, e.id as other_id FROM relations r JOIN entries e ON e.id = CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END WHERE (r.source_id=? OR r.target_id=?) AND e.deleted=0').bind(id, id, id).all();
    return { ...entry, files: files.map((f: any) => ({ ...f, github_status: f.github_status ? JSON.parse(f.github_status) : null })), relations };
}
export async function create(data: any, id: string = crypto.randomUUID()) { const v = validateEntry(data), t = now(); await db().batch([db().prepare('INSERT INTO entries(id,title,body,summary,module,category,kind,tags,origin,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, v.title, v.body, v.summary, v.module, v.category, v.kind, JSON.stringify(v.tags), 'local', v.state, t, t), db().prepare('INSERT INTO activity(id,entry_id,title,action,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), id, v.title, 'Skapad', t)]); return read(id); }
export async function update(id: string, data: any) {
    const old = await read(id);
    if (!Number.isInteger(data.version) || data.version !== old.version)
        throw Object.assign(Error('Posten har ändrats. Läs in den senaste versionen innan du sparar.'), { status: 409 });
    const v = validateEntry({ ...old, ...data }), deleted = data.deleted === undefined ? Number(old.deleted) : Number(!!data.deleted), favorite = data.favorite === undefined ? Number(old.favorite) : Number(!!data.favorite), t = now(), snapshotId = crypto.randomUUID();
    const r = await db().batch([
        db().prepare('INSERT INTO versions(id,entry_id,snapshot,created_at) SELECT ?,id,?,? FROM entries WHERE id=? AND version=?').bind(snapshotId, JSON.stringify(old), t, id, data.version),
        db().prepare('UPDATE entries SET title=?,body=?,summary=?,module=?,category=?,kind=?,tags=?,state=?,favorite=?,deleted=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(v.title, v.body, v.summary, v.module, v.category, v.kind, JSON.stringify(v.tags), v.state, favorite, deleted, t, id, data.version),
        db().prepare('INSERT INTO activity(id,entry_id,title,action,created_at) SELECT ?,entry_id,?,?,? FROM versions WHERE id=?').bind(crypto.randomUUID(), v.title, deleted ? 'Flyttad till papperskorg' : 'Uppdaterad', t, snapshotId)
    ]);
    if (!r[1].meta.changes)
        throw Object.assign(Error('Samtidig ändring. Ladda om posten.'), { status: 409 });
    return read(id);
}
export async function relate(data: any) { const v = validateRelation(data); await read(v.sourceId); await read(v.targetId); const id: string = crypto.randomUUID(); await db().prepare('INSERT INTO relations(id,source_id,target_id,type,note,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_id,target_id,type) DO UPDATE SET note=excluded.note').bind(id, v.sourceId, v.targetId, v.type, v.note, now()).run(); return { ok: true }; }
export async function stats() {
    const d = db();
    const queries = await d.batch([
        d.prepare('SELECT module,count(*) as n FROM entries WHERE deleted=0 AND state<>? GROUP BY module').bind('inkorg'), d.prepare('SELECT category,count(*) as n FROM entries WHERE deleted=0 GROUP BY category ORDER BY n DESC'), d.prepare('SELECT count(*) as n FROM entries WHERE deleted=0 AND state=?').bind('inkorg'), d.prepare('SELECT count(*) as n, coalesce(sum(size),0) as bytes FROM files'), d.prepare('SELECT count(*) as n FROM relations'), d.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 12'), d.prepare("SELECT key,value FROM settings WHERE key NOT LIKE 'mirror_%' AND key NOT LIKE 'upload_lock:%'"), d.prepare('SELECT count(*) as n FROM entries WHERE deleted=1')
    ]);
    return { modules: queries[0].results, categories: queries[1].results, inbox: (queries[2].results[0] as any).n, files: queries[3].results[0], relations: (queries[4].results[0] as any).n, activity: queries[5].results, settings: Object.fromEntries(queries[6].results.map((x: any) => [x.key, JSON.parse(x.value)])), trash: (queries[7].results[0] as any).n };
}
export async function exportData() { const tables = ['entries', 'files', 'relations', 'versions', 'activity', 'settings']; const snapshots = await db().batch(tables.map(t => db().prepare('SELECT * FROM ' + t))); const data: any = { format: 'nexus-backup', schema: 1, exportedAt: now(), githubIsSourceOfTruth: true }; tables.forEach((t, i) => data[t] = snapshots[i].results); return data; }
