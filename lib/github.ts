import { validateStoryRegister } from './story-register.mjs';
import { mirroredRead, mirrorStatus, renderMirror } from './mirror';
import { replicaReader } from '@/platform/mirror-access';
import { makeCatalog, readableRecord, REPOSITORIES } from './catalog.mjs';
import { env } from '@/platform/env';
import { githubClient, GITHUB_UPLOAD_LIMIT } from './github-inbox.mjs';
import { db, bucket, sha256, now, log } from './store';
export const github = (repoKey = 'databas') => { const repository = (REPOSITORIES as any)[repoKey]; if (!repository)
    throw Error('Okänt repo.'); return githubClient(String((env as any)['Github-Token'] || (env as any).GITHUB_READ_TOKEN || '').trim(), fetch, repository); };
export async function githubStatus() { try {
    return await github().status();
}
catch (e: any) {
    return { configured: !!((env as any)['Github-Token'] || (env as any).GITHUB_READ_TOKEN), readable: false, error: e.message };
} }
export async function sendFileToGitHub(id: string) {
    const f = await db().prepare('SELECT * FROM files WHERE id=?').bind(id).first<any>();
    if (!f || f.origin !== 'local')
        throw Error('Endast egna uppladdningar kan skickas till GitHub.');
    let receipt: any;
    try {
        if (f.size > GITHUB_UPLOAD_LIMIT)
            throw Error('Filen är sparad lokalt. GitHub-överföring stöder högst 10 MB per fil i denna version.');
        const object = await bucket().get(f.key);
        if (!object)
            throw Error('Originalfilen saknas i Nexus Hub.');
        const bytes = await object.arrayBuffer();
        if (await sha256(bytes) !== f.hash)
            throw Error('Originalfilens kontrollsumma stämmer inte.');
        receipt = { ...await github().upload(f.id, f.name, bytes), updatedAt: now() };
    }
    catch (e: any) {
        receipt = { state: 'pending', error: e.message, updatedAt: now() };
    }
    await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('github_file:' + id, JSON.stringify(receipt)).run();
    if (receipt.state === 'sent')
        await log('Original skickat till GitHub-inkorgen', f.name, f.entry_id);
    return receipt;
}
export async function readGitHubPath(path: string, repoKey = 'databas', ref: string | null = null) {
    if (!ref) {
        const snapshot=await replicaReader.current(repoKey);
        if(snapshot && (path==='' || snapshot.files.some((f:any)=>f.path.startsWith(path.replace(/\/$/,'')+'/')))){
            const prefix=path?path.replace(/\/$/,'')+'/':'',entries=new Map<string,any>();
            for(const file of snapshot.files){
                if(!file.path.startsWith(prefix))continue;
                const tail=file.path.slice(prefix.length),part=tail.split('/')[0],directory=tail.includes('/');
                if(!part)continue;
                const target=prefix+part;
                if(!entries.has(target))entries.set(target,{path:target,name:part,type:directory?'dir':'file',size:directory?0:file.size,sha:directory?null:file.sha});
            }
            return {type:'directory',repoKey,path,name:path.split('/').pop()||'Databas',entries:[...entries.values()].sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name,'sv'):a.type==='dir'?-1:1),commit:snapshot.commit,origin:'github-mirror',readOnly:true};
        }
        const local=await replicaReader.file(repoKey,path);
        if(local){
            const url='https://github.com/'+(REPOSITORIES as any)[repoKey]+'/blob/'+local.commit+'/'+path;
            return {...renderMirror(local.bytes.buffer as ArrayBuffer,path,{repoKey,sha:local.sha,commit:local.commit,size:local.size,url,origin:'github-mirror'}),id:'github:'+path};
        }
    }
    const data: any = await github(repoKey).browse(path, ref);
    let body = '';
    if (data.type === 'directory')
        body = data.entries.map((e: any) => (e.type === 'dir' ? 'Mapp: ' : 'Fil: ') + e.path).join('\n');
    else if (data.encoding === 'base64' && typeof data.content === 'string' && /\.(md|txt|json|csv|ya?ml|xml|log|rst)$/i.test(data.name))
        body = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(data.content.replace(/\s/g, '')), c => c.charCodeAt(0)));
    let title = data.name || path || 'Databas';
    if (/\.md$/i.test(data.name || '') && body)
        title = body.match(/^#\s+([^\n]+)/m)?.[1] || title;
    let structured = false;
    if (data.type === 'file' && body && /\.json$/i.test(data.name)) {
        const readable = readableRecord(body);
        body = readable.body;
        title = readable.title || title;
        structured = readable.structured;
    }
    const { content, ...metadata } = data;
    return { ...metadata, repoKey, id: 'github:' + path, title, body, structured, origin: 'github-live', readOnly: true };
}
const pluginManifestCache = new Map<string, any>();
let portalCache: any = null;
let portalCacheUntil = 0;
let portalPending: Promise<any> | null = null;
export function invalidatePortalCache() { portalCache = null; portalCacheUntil = 0; }
export async function portalOverview(refresh = false) {
    if (!refresh && portalCache && Date.now() < portalCacheUntil)
        return portalCache;
    if (portalPending)
        return portalPending;
    portalPending = (async () => {
        const [database, plugins] = await Promise.allSettled([github().snapshot(), github('plugins').snapshot()]);
        const metadata = (await db().prepare("SELECT id,title,summary,module,category,kind,tags,source_path FROM entries WHERE deleted=0 AND origin='github'").all()).results;
        const out: any = { generatedAt: now(), repositories: {}, errors: [] };
        if (database.status === 'fulfilled') {
            const snap = database.value, treePaths = new Set(snap.tree.map((f: any) => f.path)), topicFiles = snap.tree.filter((f: any) => /^Kunskap\/Kunskapsbanken\/records\/topic-[^/]+\.json$/.test(f.path));
            const enriched = new Map(metadata.map((e: any) => [e.source_path, e])), active = new Set<string>(), topicDetails: any[] = [], warnings: string[] = [];
            const decode = (data: any) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g, '')), c => c.charCodeAt(0)))).record;
            const selected = topicFiles;
            for (let i = 0; i < selected.length; i += 4) {
                await Promise.all(selected.slice(i, i + 4).map(async (f: any) => {
                    try {
                        const topic = decode(await github().browse(f.path, snap.commit)), base = f.path.slice(0, f.path.lastIndexOf('/') + 1);
                        if (!topic.active_revision)
                            throw Error('Aktiv revision saknas');
                        const revision = decode(await github().browse(base + 'revision-' + topic.active_revision + '.json', snap.commit));
                        enriched.set(f.path, { ...(enriched.get(f.path) || {}), source_path: f.path, title: topic.title, category: topic.category, summary: topic.description, tags: JSON.stringify(topic.tags || []), kind: 'Ämne', topic_id: topic.topic_id, topic_path: f.path });
                        let chunkCount = 0;
                        for (const section of revision.sections || [])
                            for (const [index, id] of (section.chunk_ids || []).entries()) {
                                const path = base + 'chunk-' + id + '.json';
                                if (!treePaths.has(path))
                                    continue;
                                active.add(path);
                                chunkCount++;
                                const previous: any = enriched.get(path);
                                enriched.set(path, { ...(previous || {}), source_path: path, title: previous?.title || section.title + (section.chunk_ids.length > 1 ? ' · del ' + (index + 1) : ''), category: topic.category, summary: previous?.summary || section.description || topic.description, tags: JSON.stringify(topic.tags || []), kind: previous?.kind || 'Kunskap', topic_id: topic.topic_id, topic_path: f.path, section_title: section.title });
                            }
                        topicDetails.push({ path: f.path, topicId: topic.topic_id, title: topic.title, category: topic.category, description: topic.description, knowledgeGaps: topic.knowledge_gaps || [], relatedTopicIds: topic.related_topic_ids || [], chunkCount });
                    }
                    catch (e: any) {
                        warnings.push('Ämnesmetadata kunde inte uppdateras för ' + f.path + ': ' + e.message);
                    }
                }));
            }
            out.repositories.databas = { ...makeCatalog(snap, [...enriched.values()], active), knowledgeTopics: topicDetails, warnings };
            try {
                const file = await github().readStoryRegister(), register = validateStoryRegister(JSON.parse(file.content));
                for (const doc of out.repositories.databas.documents) {
                    const row = register.entries[doc.path];
                    if (row) {
                        doc.storyMetadata = row;
                        if (row.title)
                            doc.title = row.title;
                        if (row.category)
                            doc.category = row.category;
                    }
                }
            }
            catch (e: any) {
                warnings.push('Berättelseregistrets ändringar kunde inte hämtas: ' + e.message);
            }
        }
        else
            out.errors.push({ repo: 'databas', error: database.reason.message });
        if (plugins.status === 'fulfilled') {
            const snap = plugins.value;
            let registry: any = { plugins: [] };
            try {
                const c: any = await github('plugins').browse('catalog.json', snap.commit);
                registry = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(c.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
            }
            catch { }
            const packages = snap.tree.filter((f: any) => f.type === 'blob' && f.path.endsWith('/.codex-plugin/plugin.json')).map((f: any) => { const sourcePath = f.path.replace('/.codex-plugin/plugin.json', ''), entry = registry.plugins?.find((p: any) => p.source_path === sourcePath); return { path: f.path, sourcePath, title: entry?.name || sourcePath.split('/').pop(), name: entry?.name || sourcePath.split('/').pop(), version: entry?.version || null, versionSource: 'repoindex', archived: sourcePath.startsWith('Avinstallerade/'), legacy: !!entry?.replaced_by_plugin_id, publicationState: entry?.publication_state || 'Ej registrerad i repoindex', pluginUrl: entry?.plugin_url || null, files: snap.tree.filter((x: any) => x.type === 'blob' && x.path.startsWith(sourcePath + '/')).map((x: any) => ({ path: x.path, size: x.size, sha: x.sha })), skills: snap.tree.filter((x: any) => x.type === 'blob' && x.path.startsWith(sourcePath + '/skills/') && x.path.endsWith('/SKILL.md')).map((x: any) => x.path) }; });
            for (let i = 0; i < packages.length; i += 4) {
                await Promise.all(packages.slice(i, i + 4).map(async (p: any) => {
                    const blob = snap.tree.find((f: any) => f.path === p.path)?.sha;
                    try {
                        let manifest = pluginManifestCache.get(blob);
                        if (!manifest) {
                            const raw: any = await github('plugins').browse(p.path, snap.commit);
                            manifest = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
                            if (pluginManifestCache.size > 100)
                                pluginManifestCache.clear();
                            pluginManifestCache.set(blob, manifest);
                        }
                        p.version = manifest.version || null;
                        p.versionSource = 'manifest';
                        p.title = manifest.interface?.displayName || manifest.display_name || p.title;
                        p.description = manifest.description || '';
                    }
                    catch {
                        p.version = null;
                        p.versionSource = 'unavailable';
                    }
                }));
            }
            out.repositories.plugins = { commit: snap.commit, fetchedAt: snap.fetchedAt, complete: !snap.truncated, files: snap.tree.filter((f: any) => f.type === 'blob').map((f: any) => ({ path: f.path, size: f.size })), fileCount: snap.tree.filter((f: any) => f.type === 'blob').length, packages, recent: snap.recent };
        }
        else
            out.errors.push({ repo: 'plugins', error: plugins.reason.message });
        if (out.repositories.databas) {
            portalCache = out;
            portalCacheUntil = Date.now() + 60000;
        }
        return out;
    })();
    try {
        return await portalPending;
    }
    finally {
        portalPending = null;
    }
}
export async function portalDocument(path: string, repoKey = 'databas') {
    const local = await replicaReader.file(repoKey,path);
    const live: any = local ? renderMirror(local.bytes.buffer as ArrayBuffer,path,{
        repoKey,sha:local.sha,commit:local.commit,size:local.size,
        origin:'github-mirror',mirror:{state:'verified',lastTreeVerifiedAt:local.commit},
    }) : await mirroredRead(repoKey, path, github(repoKey)) || await readGitHubPath(path, repoKey);
    let related: any[] = [];
    let localId = null;
    if (repoKey === 'databas') {
        const e = await db().prepare('SELECT id,title,category,kind,tags FROM entries WHERE source_path=? AND deleted=0 LIMIT 1').bind(path).first<any>();
        if (e) {
            localId = e.id;
            live.title = live.title !== live.name ? live.title : e.title;
            live.category = e.category;
            live.kind = e.kind;
            live.tags = JSON.parse(e.tags || '[]');
            related = (await db().prepare('SELECT r.type,r.note,e.title,e.source_path as path FROM relations r JOIN entries e ON e.id=CASE WHEN r.source_id=? THEN r.target_id ELSE r.source_id END WHERE (r.source_id=? OR r.target_id=?) AND e.deleted=0').bind(e.id, e.id, e.id).all()).results.map((r: any) => ({ ...r, note: (r.note ? r.note + ' · ' : '') + 'Sparat relationsregister i Nexus Hub' }));
        }
    }
    if (repoKey === 'plugins' && path.endsWith('plugin.json') && live.body) {
        try {
            const cached=local?await replicaReader.json('plugins',path):null;
            const raw: any = cached?null:await github('plugins').browse(path,live.commit);
            const manifest = cached || JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
            live.manifest = { name: manifest.name, version: manifest.version, description: manifest.description, raw: manifest };
            live.title = manifest.interface?.displayName || manifest.display_name || manifest.name || live.title;
            live.body = '# ' + live.title + '\n\n' + (manifest.description || 'Ingen beskrivning i manifestet.') + '\n\n## Manifest\n\n```json\n' + JSON.stringify(manifest, null, 2) + '\n```';
        }
        catch { }
    }
    const overview = portalCache;
    const catalog = overview?.repositories?.databas;
    const entry = repoKey === 'databas' ? catalog?.documents?.find((d: any) => d.path === path) : null;
    const topic = entry?.topicPath ? catalog?.knowledgeTopics?.find((t: any) => t.path === entry.topicPath) : null;
    if (topic) {
        if (topic.path !== path)
            related.unshift({ path: topic.path, title: topic.title, type: 'Del av ämne enligt GitHub-registret', note: entry.section || '' });
        else
            for (const id of topic.relatedTopicIds) {
                const target = catalog.knowledgeTopics.find((t: any) => t.topicId === id);
                if (target)
                    related.unshift({ path: target.path, title: target.title, type: 'Ämneskoppling enligt GitHub-registret', note: '' });
            }
    }
    return { ...live, related, localId };
}
