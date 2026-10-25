import { invalid, apiFailure } from '@/lib/errors.mjs';
import { mirrorAuditStatus, beginMirrorAudit, nextMirrorAuditBatch, repairMirrorAuditBatch, retryMirrorAuditRepairs } from '@/lib/mirror-audit';
import { syncMirror, mirrorStatus, searchMirror, mirrorOriginal, compareMirrorPaths, mirrorDiscrepancies } from '@/lib/mirror';
import { github, githubStatus, sendFileToGitHub, readGitHubPath, portalOverview, portalDocument } from '@/lib/github';
import { db, bucket, list, read, create, update, relate, stats, exportData, sha256, now, log } from '@/lib/store';
import { MAX_FILE_SIZE, validateEntry, validateBackup } from '@/lib/domain.mjs';
export const dynamic = 'force-dynamic';
const json = (value: any, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
// This shared database is protected by Sites' owner-private access policy.
// Dispatch authenticates visitors and consumes the service access bearer token.
// Never make the Site public without adding application-level authorization.
async function handle(req: Request) {
    try {
        const url = new URL(req.url), path = url.pathname.slice(5).split('/').filter(Boolean), [resource, id, action] = path, method = req.method;
        if (method !== 'GET' && method !== 'HEAD') {
            const origin = req.headers.get('origin');
            if (origin && origin !== url.origin)
                return json({ error: 'Otillåtet ursprung.' }, 403);
        }
        if (resource === 'portal' && id === 'audit' && method === 'GET')
            return json(await mirrorAuditStatus({ offset: Math.max(0, Number(url.searchParams.get('offset')) || 0), filter: url.searchParams.get('filter') || 'all' }));
        if (resource === 'portal' && id === 'audit' && method === 'POST') {
            if (action === 'start')
                return json(await beginMirrorAudit(github('databas')));
            if (action === 'restart')
                return json(await beginMirrorAudit(github('databas'), true));
            if (action === 'next')
                return json(await nextMirrorAuditBatch(12));
            if (action === 'repair')
                return json(await repairMirrorAuditBatch(github('databas'), 4));
            if (action === 'retry-repairs')
                return json(await retryMirrorAuditRepairs());
            return json({ error: 'Okänd kontrollåtgärd.' }, 404);
        }
        if (resource === 'portal' && id === 'compare' && method === 'POST') {
            const body: any = await req.json();
            const repo = body.repo || 'databas';
            return json(await compareMirrorPaths(body.paths, repo, github(repo)));
        }
        if (resource === 'portal' && id === 'sync' && method === 'POST') {
            const a: any = await req.json();
            return json(await syncMirror(github(a.repo || 'databas'), a));
        }
        if (resource === 'portal' && id === 'differences' && method === 'GET')
            return json(await mirrorDiscrepancies(Number(url.searchParams.get('offset')) || 0, 30, github('databas')));
        if (resource === 'portal' && method === 'GET') {
            if (id === 'mirror')
                return json(await mirrorStatus(url.searchParams.get('repo') || 'databas'));
            if (id === 'mirror-search')
                return json(await searchMirror(url.searchParams.get('q') || '', Math.max(0, Number(url.searchParams.get('offset')) || 0)));
            if (id === 'original') {
                const ref = url.searchParams.get('ref') || '';
                if (!/^[a-f0-9]{40}$/.test(ref))
                    throw invalid('En exakt GitHub-version krävs.');
                const original: any = await mirrorOriginal(url.searchParams.get('repo') || 'databas', url.searchParams.get('path') || '', ref, url.searchParams.get('blob') || undefined) || await github(url.searchParams.get('repo') || 'databas').original(url.searchParams.get('path') || '', ref);
                const { response, file } = original;
                const mime = ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' } as Record<string, string>)[file.name.split('.').pop()?.toLowerCase() || ''];
                const inline = url.searchParams.get('inline') === '1' && !!mime;
                return new Response(response.body, { headers: { 'Content-Type': inline ? mime : 'application/octet-stream', 'Content-Disposition': (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(file.name), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
            }
            if (id === 'inbox') {
                const r = await list(new URLSearchParams({ state: 'inkorg', limit: '100', offset: String(Math.max(0, Number(url.searchParams.get('offset')) || 0)) }));
                return json({ ...r, entries: await Promise.all(r.entries.map((e: any) => read(e.id))) });
            }
            if (id === 'overview')
                return json(await portalOverview(url.searchParams.get('refresh') === '1'));
            if (id === 'document')
                return json(await portalDocument(url.searchParams.get('path') || '', url.searchParams.get('repo') || 'databas'));
        }
        if (resource === 'github' && method === 'GET') {
            if (id === 'status')
                return json(await githubStatus());
            if (id === 'browse')
                return json(await readGitHubPath(url.searchParams.get('path') || ''));
        }
        if (resource === 'files' && id && action === 'github' && method === 'POST')
            return json(await sendFileToGitHub(id));
        if (resource === 'stats' && method === 'GET')
            return json(await stats());
        if (resource === 'entries') {
            if (!id && method === 'GET')
                return json(await list(url.searchParams));
            if (!id && method === 'POST')
                return json(await create(await req.json()), 201);
            if (id && action === 'versions' && method === 'GET')
                return json((await db().prepare('SELECT * FROM versions WHERE entry_id=? ORDER BY created_at DESC').bind(id).all()).results);
            if (id && method === 'GET')
                return json(await read(id));
            if (id && method === 'PATCH')
                return json(await update(id, await req.json()));
        }
        if (resource === 'relations') {
            if (method === 'GET') {
                const { results } = await db().prepare('SELECT r.*,s.title as source_title,t.title as target_title FROM relations r JOIN entries s ON r.source_id=s.id JOIN entries t ON r.target_id=t.id WHERE s.deleted=0 AND t.deleted=0 ORDER BY r.created_at DESC').all();
                return json(results);
            }
            if (method === 'POST')
                return json(await relate(await req.json()));
            if (id && method === 'DELETE') {
                await db().prepare('DELETE FROM relations WHERE id=?').bind(id).run();
                return json({ ok: true });
            }
        }
        if (resource === 'files') {
            if (id && method === 'GET') {
                const f = await db().prepare('SELECT * FROM files WHERE id=?').bind(id).first<any>();
                if (!f)
                    return json({ error: 'Filen finns inte.' }, 404);
                const object = await bucket().get(f.key);
                if (!object)
                    return json({ error: 'Filinnehållet saknas.' }, 404);
                return new Response(object.body, { headers: { 'Content-Type': url.searchParams.get('inline') === '1' && ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.mime) ? f.mime : 'application/octet-stream', 'Content-Disposition': `${url.searchParams.get('inline') === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'no-store', 'X-Content-SHA256': f.hash } });
            }
            if (!id && method === 'GET') {
                const q = '%' + String(url.searchParams.get('q') || '').slice(0, 200) + '%', offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
                return json({ files: (await db().prepare('SELECT * FROM files WHERE name LIKE ? OR source_path LIKE ? ORDER BY created_at DESC LIMIT 50 OFFSET ?').bind(q, q, offset).all()).results, total: (await db().prepare('SELECT count(*) as n FROM files WHERE name LIKE ? OR source_path LIKE ?').bind(q, q).first<any>()).n });
            }
            if (!id && method === 'POST') {
                const form = await req.formData(), file = form.get('file');
                if (!(file instanceof File))
                    return json({ error: 'Välj en fil.' }, 400);
                if (file.size > MAX_FILE_SIZE)
                    return json({ error: 'Högst 25 MB per fil i denna version.' }, 413);
                const bytes = await file.arrayBuffer(), hash = await sha256(bytes), submittedId = String(form.get('uploadId') || '');
                if (submittedId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(submittedId))
                    return json({ error: 'Ogiltigt uppladdnings-ID.' }, 400);
                const fid = submittedId || crypto.randomUUID(), key = 'uploads/' + fid, entryId = String(form.get('entryId') || '');
                const existing = await db().prepare('SELECT * FROM files WHERE id=?').bind(fid).first<any>();
                if (existing) {
                    if (existing.origin !== 'local' || existing.hash !== hash || existing.name !== file.name)
                        return json({ error: 'Uppladdnings-ID används redan för en annan fil.' }, 409);
                    const receipt = await db().prepare('SELECT value FROM settings WHERE key=?').bind('github_file:' + fid).first<any>();
                    const githubReceipt = receipt ? JSON.parse(receipt.value) : await sendFileToGitHub(fid);
                    return json({ id: fid, entryId: existing.entry_id, hash, size: existing.size, github: githubReceipt, reused: true });
                }
                const owner = crypto.randomUUID(), lockKey = 'upload_lock:' + fid, cutoff = new Date(Date.now() - 120000).toISOString();
                const lock = await db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(settings.value,'$.startedAt') < ? AND json_extract(settings.value,'$.hash')=json_extract(excluded.value,'$.hash') AND json_extract(settings.value,'$.name')=json_extract(excluded.value,'$.name')").bind(lockKey, JSON.stringify({ owner, hash, name: file.name, startedAt: now() }), cutoff).run();
                if (!lock.meta.changes)
                    return json({ error: 'Samma uppladdning behandlas redan. Kontrollera inkorgen och försök igen med samma fil. Ett avbrutet försök kan återupptas efter två minuter.' }, 409);
                const owns = async () => !!await db().prepare("SELECT key FROM settings WHERE key=? AND json_extract(value,'$.owner')=?").bind(lockKey, owner).first();
                try {
                    if (!await owns())
                        throw invalid('Uppladdningen har tagits över av ett nytt försök.');
                    let e: any;
                    if (entryId)
                        e = await read(entryId);
                    else {
                        const stableEntryId = 'upload-' + fid;
                        try {
                            e = await read(stableEntryId);
                        }
                        catch (err: any) {
                            if (err.status !== 404)
                                throw err;
                            e = await create({ title: String(form.get('title') || file.name), category: String(form.get('category') || 'Osorterat'), module: String(form.get('module') || 'databas'), state: 'inkorg', body: bytes.byteLength <= 1800000 && /\.(md|txt|csv|json)$/i.test(file.name) ? new TextDecoder().decode(bytes) : '', tags: [] }, stableEntryId);
                        }
                    }
                    if (!await owns())
                        throw invalid('Uppladdningen har tagits över av ett nytt försök.');
                    await bucket().put(key, bytes, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
                    const inserted = await db().prepare("INSERT INTO files(id,entry_id,name,key,mime,size,hash,origin,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND json_extract(value,'$.owner')=?)").bind(fid, e.id, file.name, key, file.type || 'application/octet-stream', file.size, hash, 'local', now(), lockKey, owner).run();
                    if (!inserted.meta.changes)
                        throw invalid('Uppladdningen har tagits över av ett nytt försök.');
                    await log('Fil uppladdad', file.name, e.id);
                    const githubReceipt = await sendFileToGitHub(fid);
                    return json({ id: fid, entryId: e.id, hash, size: file.size, github: githubReceipt }, 201);
                }
                finally {
                    await db().prepare("DELETE FROM settings WHERE key=? AND json_extract(value,'$.owner')=?").bind(lockKey, owner).run();
                }
            }
        }
        if (resource === 'integrity' && method === 'GET') {
            const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0), limit = Math.min(40, Math.max(1, Number(url.searchParams.get('limit')) || 20));
            const rows = (await db().prepare('SELECT id,key,hash,size FROM files ORDER BY id LIMIT ? OFFSET ?').bind(limit, offset).all()).results as any[];
            const checks = [];
            for (let i = 0; i < rows.length; i += 6) {
                checks.push(...await Promise.all(rows.slice(i, i + 6).map(async (f) => { const o = await bucket().get(f.key); if (!o)
                    return { id: f.id, ok: false, error: 'Filinnehåll saknas' }; const b = await o.arrayBuffer(); const hash = await sha256(b); return { id: f.id, ok: hash === f.hash && b.byteLength === f.size, hash, size: b.byteLength }; })));
            }
            return json({ offset, checks });
        }
        if (resource === 'export' && method === 'GET')
            return new Response(JSON.stringify(await exportData()), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="nexus-backup.json"', 'Cache-Control': 'no-store' } });
        if (resource === 'restore' && method === 'POST') {
            const data = await req.json() as any;
            validateBackup(data);
            // Merge only absent records: restoration never silently overwrites current work.
            const columns: Record<string, string[]> = { entries: ['id', 'title', 'body', 'summary', 'module', 'category', 'kind', 'tags', 'origin', 'source_path', 'source_sha', 'content_hash', 'state', 'version', 'favorite', 'deleted', 'created_at', 'updated_at'], files: ['id', 'entry_id', 'name', 'key', 'mime', 'size', 'hash', 'origin', 'source_path', 'source_sha', 'created_at'], relations: ['id', 'source_id', 'target_id', 'type', 'note', 'created_at'], versions: ['id', 'entry_id', 'snapshot', 'created_at'], activity: ['id', 'entry_id', 'title', 'action', 'created_at'], settings: ['key', 'value'] };
            let inserted = 0, skipped = 0, conflicts = 0;
            const statements = [];
            // Validate the complete backup before a transaction. No INSERT OR IGNORE:
            // malformed rows must fail, never disappear silently.
            for (const table of Object.keys(columns)) {
                const cs = columns[table], key = table === 'settings' ? 'key' : 'id';
                const existing = (await db().prepare('SELECT * FROM ' + table).all()).results;
                const byId = new Map(existing.map((r: any) => [r[key], r]));
                for (const row of data[table]) {
                    const old: any = byId.get(row[key]);
                    if (old) {
                        skipped++;
                        if (cs.some(c => (old[c] ?? null) !== (row[c] ?? null)))
                            conflicts++;
                        continue;
                    }
                    statements.push(db().prepare(`INSERT INTO ${table} (${cs.join(',')}) VALUES (${cs.map(() => '?').join(',')})`).bind(...cs.map(c => row[c] ?? null)));
                }
            }
            // D1 batch is transactional: all selected rows are inserted or none are.
            if (statements.length) {
                const result = await db().batch(statements);
                inserted = result.reduce((n, r) => n + r.meta.changes, 0);
            }
            return json({ inserted, skipped, conflicts, mode: 'only-missing', note: 'Originalfiler återställs separat från säkerhetskopians files-mapp.' });
        }
        if (resource === 'restore-file' && id && method === 'POST') {
            const f = await db().prepare('SELECT * FROM files WHERE id=?').bind(id).first<any>();
            if (!f)
                throw invalid('Filmetadata saknas. Återställ JSON först.');
            const bytes = await req.arrayBuffer();
            if (await sha256(bytes) !== f.hash)
                throw invalid('Kontrollsumman stämmer inte.');
            await bucket().put(f.key, bytes);
            return json({ ok: true });
        }
        return json({ error: 'Sidan finns inte.' }, 404);
    }
    catch (error: any) {
        if (error instanceof SyntaxError)
            return json({ error: 'Ogiltig JSON.' }, 400);
        const failure = apiFailure(error);
        return json({ error: failure.message }, failure.status);
    }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
