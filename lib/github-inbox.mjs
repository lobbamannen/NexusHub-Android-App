import { REPOSITORIES } from './catalog.mjs';
export const GITHUB_REPO = 'lobbamannen/Databas';
export const GITHUB_UPLOAD_LIMIT = 10 * 1024 * 1024;
export function inboxPath(id, name) {
    if (!/^[a-z0-9-]{1,80}$/i.test(id))
        throw Error('Ogiltigt fil-ID.');
    const clean = String(name).normalize('NFC').replace(/[\\/\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '').slice(-160) || 'dokument';
    return '00-Inkorg/' + id + '-' + clean;
}
export async function gitBlobSha(bytes) { const prefix = new TextEncoder().encode('blob ' + bytes.byteLength + '\0'), all = new Uint8Array(prefix.length + bytes.byteLength); all.set(prefix); all.set(new Uint8Array(bytes), prefix.length); return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function base64(bytes) { const data = new Uint8Array(bytes); let binary = ''; for (let i = 0; i < data.length; i += 16384)
    binary += String.fromCharCode(...data.subarray(i, i + 16384)); return btoa(binary); }
// Only allowlisted GitHub endpoints, fixed-scope register writes and one create-only inbox PUT are exposed.
export function githubClient(token, transport = fetch, repository = GITHUB_REPO) {
    if (!Object.values(REPOSITORIES).includes(repository))
        throw Error('Repositoryt är inte tillåtet.');
    if (!token)
        throw Error('GitHub-token saknas i sidans Secrets.');
    const call = async (path, options = {}) => { const response = await transport('https://api.github.com/repos/' + repository + path, { ...options, redirect: 'manual', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'Nexus-Hub', 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}), Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) }); if (!response.ok && response.status !== 404) {
        throw Object.assign(Error(response.status === 401 ? 'GitHub-token är ogiltig eller har gått ut.' : response.status === 403 ? 'GitHub nekade åtkomst eller anropsgränsen är nådd.' : response.status === 409 || response.status === 422 ? 'GitHub kunde inte spara filen. Försök igen; befintliga filer skrivs inte över.' : 'GitHub svarade med fel ' + response.status + '.'), { status: response.status });
    } return response; };
    const filePath = path => '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    return {
        async status() { const r = await call(''); if (r.status === 404)
            throw Error('Tokenen saknar åtkomst till Databas.'); const repo = await r.json(); return { configured: true, readable: true, repo: repo.full_name, branch: repo.default_branch, uploadFolder: '00-Inkorg/', writeVerified: false }; },
        async browse(path = '', ref = /** @type {string|null} */ (null)) {
            if (typeof path !== 'string' || path.length > 1000 || path.startsWith('/') || path.split('/').some(p => p === '..' || p === '.') || path.includes('\\'))
                throw Error('Ogiltig sökväg.');
            let commit = ref;
            if (!commit) {
                const latest = await call('/commits?per_page=1');
                if (!latest.ok)
                    throw Error('Kunde inte läsa aktuell GitHub-version.');
                const commits = await latest.json();
                commit = commits[0]?.sha;
            }
            if (!/^[a-f0-9]{40}$/.test(commit || ''))
                throw Error('GitHub returnerade ingen giltig version.');
            const r = await call(filePath(path) + '?ref=' + commit);
            if (r.status === 404)
                throw Error('Sökvägen finns inte i GitHub.');
            const value = await r.json();
            const source = { repo: repository, commit, fetchedAt: new Date().toISOString(), path };
            if (Array.isArray(value))
                return { ...source, type: 'directory', entries: value.map(f => ({ name: f.name, path: f.path, type: f.type, size: f.size, sha: f.sha, url: f.html_url })), possiblyTruncated: value.length >= 1000 };
            return { ...source, type: 'file', name: value.name, size: value.size, url: value.html_url, sha: value.sha, encoding: value.encoding, content: value.size <= 1000000 ? value.content : undefined };
        },
        async original(path, ref) { const file = await this.browse(path, ref); if (file.type !== 'file')
            throw Error('Välj en fil.'); const response = await call(filePath(path) + '?ref=' + file.commit, { headers: { Accept: 'application/vnd.github.raw+json' } }); if (!response.ok)
            throw Error('Originalet kunde inte hämtas.'); return { response, file }; },
        async snapshot() { const r = await call('/commits?per_page=8'); if (!r.ok)
            throw Error('Kunde inte läsa GitHub-historiken.'); const commits = await r.json(), commit = commits[0]?.sha; if (!/^[a-f0-9]{40}$/.test(commit || ''))
            throw Error('GitHub-version saknas.'); const t = await call('/git/trees/' + commit + '?recursive=1'); if (!t.ok)
            throw Error('Kunde inte läsa filträdet.'); const data = await t.json(); return { commit, fetchedAt: new Date().toISOString(), truncated: !!data.truncated, tree: data.tree, recent: commits.map(c => ({ sha: c.sha, title: c.commit.message.split('\n')[0], date: c.commit.committer?.date, url: c.html_url })) }; },
        // Fixed-scope film register.
        async readFilmRegister() {
            if (repository !== GITHUB_REPO)
                throw Error('Filmregistret får bara läsas från Databas.');
            const response = await call(filePath('Filmer/register.json') + '?ref=main');
            if (!response.ok)
                throw Error('GitHubs filmregister saknas.');
            const file = await response.json();
            if (!/^[a-f0-9]{40}$/.test(file.sha || '') || file.encoding !== 'base64' || typeof file.content !== 'string')
                throw Error('GitHub levererade inte ett komplett filmregister.');
            const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
            if (await gitBlobSha(bytes) !== file.sha)
                throw Error('Filmregistrets innehåll matchade inte GitHubs filhash.');
            return { sha: file.sha, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), size: bytes.length };
        },
        async writeFilmRegister(expectedSha, content) {
            if (repository !== GITHUB_REPO)
                throw Error('Filmregistret får bara skrivas i Databas.');
            if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || typeof content !== 'string' || new TextEncoder().encode(content).length > 900000)
                throw Error('Ogiltig registerversion eller för stor fil.');
            const bytes = new TextEncoder().encode(content), hash = await gitBlobSha(bytes);
            const response = await call(filePath('Filmer/register.json'), { method: 'PUT', body: JSON.stringify({ message: 'Nexus Hub: uppdatera filmregister', branch: 'main', sha: expectedSha, content: base64(bytes) }) });
            const result = await response.json();
            if (result.content?.sha !== hash)
                throw Error('GitHub tog emot skrivningen men dess kvittens avviker. Läs om registret innan nästa ändring.');
            return { sha: hash, commit: result.commit?.sha, url: result.content?.html_url };
        },
        // Fixed-scope series watchlist update, never an arbitrary file path.
        async writeSeriesRegister(expectedSha, content) {
            if (repository !== GITHUB_REPO)
                throw Error('Serieregistret får bara skrivas i Databas.');
            if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || typeof content !== 'string' || new TextEncoder().encode(content).byteLength > 900000)
                throw Error('Ogiltig version eller för stort serieregister.');
            const bytes = new TextEncoder().encode(content), hash = await gitBlobSha(bytes);
            const response = await call(filePath('Serier/register.json'), { method: 'PUT', body: JSON.stringify({ message: 'Nexus Hub: uppdatera Vill se för serie', branch: 'main', sha: expectedSha, content: base64(bytes) }) });
            const result = await response.json();
            if (result.content?.sha !== hash || !/^[a-f0-9]{40}$/.test(result.commit?.sha || ''))
                throw Error('GitHub-kvittensen kunde inte verifieras; läs om serieregistret.');
            return { sha: hash, commit: result.commit.sha, url: result.content?.html_url };
        },
        // Separate fixed-scope register: only Berattelser/lasstatus.json can be changed here.
        async readStoryStatus() {
            if (repository !== GITHUB_REPO)
                throw Error('Lässtatus får bara läsas från Databas.');
            const response = await call(filePath('Berattelser/lasstatus.json') + '?ref=main');
            if (response.status === 404)
                throw Object.assign(Error('GitHubs lässtatusregister saknas.'), { status: 404 });
            const file = await response.json();
            if (!/^[a-f0-9]{40}$/.test(file.sha || '') || file.encoding !== 'base64' || typeof file.content !== 'string')
                throw Error('GitHub gav inte ett komplett lässtatusregister.');
            const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
            if (bytes.length > 900000 || await gitBlobSha(bytes) !== file.sha)
                throw Error('Lässtatusregistrets filhash är fel.');
            return { sha: file.sha, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), size: bytes.length };
        },
        async writeStoryStatus(expectedSha, content) {
            if (repository !== GITHUB_REPO)
                throw Error('Lässtatus får bara skrivas i Databas.');
            if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || typeof content !== 'string' || new TextEncoder().encode(content).byteLength > 900000)
                throw Error('Ogiltig version eller för stort lässtatusregister.');
            const bytes = new TextEncoder().encode(content), hash = await gitBlobSha(bytes);
            const response = await call(filePath('Berattelser/lasstatus.json'), { method: 'PUT', body: JSON.stringify({ message: 'Nexus Hub: uppdatera Sparad och Läst', branch: 'main', sha: expectedSha, content: base64(bytes) }) });
            const result = await response.json();
            if (result.content?.sha !== hash || !/^[a-f0-9]{40}$/.test(result.commit?.sha || ''))
                throw Error('GitHub-kvittensen kunde inte verifieras; läs om registret.');
            return { sha: hash, commit: result.commit.sha, url: result.content.html_url };
        },
        // Economy files: strictly scoped, existing JSON documents with GitHub SHA leases.
        async writeEconomyFile(path, expectedSha, content) {
            if (repository !== GITHUB_REPO ||
                !(/^Ekonomi\/(?:Robin|Rebecca)\/budget\.json$/.test(path) ||
                  /^Ekonomi\/Gemensamt\/20\d{2}\/20\d{2}-\d{2}-\d{2}\.json$/.test(path)))
                throw Error('Ekonomifilen är inte tillåten för skrivning.');
            if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || typeof content !== 'string')
                throw Error('Versionsnyckel saknas.');
            const bytes = new TextEncoder().encode(content);
            if (bytes.byteLength > 900000) throw Error('Ekonomiregistret är för stort.');
            const hash = await gitBlobSha(bytes);
            const response = await call(filePath(path), { method: 'PUT',
                body: JSON.stringify({ message: 'Nexus Hub: uppdatera ekonomi', branch: 'main',
                    sha: expectedSha, content: base64(bytes) }) });
            if (!response.ok) throw Object.assign(Error('GitHub kunde inte spara ekonomifilen.'), { status: response.status });
            const result = await response.json();
            if (result.content?.sha !== hash || !/^[a-f0-9]{40}$/.test(result.commit?.sha || ''))
                throw Error('GitHub-kvittensen stämmer inte; läs om ekonomifilen innan nästa ändring.');
            return { sha: hash, commit: result.commit.sha, url: result.content.html_url };
        },
        // Fixed path and blob-SHA lease; story bodies and other files cannot be written here.
        async readBookmarks() {
            if (repository !== GITHUB_REPO)
                throw Error('Genvägsregistret finns bara i Databas.');
            const response = await call(filePath('System/nexus-bookmarks.json') + '?ref=main');
            if (response.status === 404)
                return { sha: null, content: '{"schemaVersion":1,"entries":{}}' };
            const file = await response.json();
            if (file.encoding !== 'base64' || typeof file.content !== 'string' || !/^[a-f0-9]{40}$/.test(file.sha || ''))
                throw Error('GitHub gav inte ett komplett genvägsregister.');
            const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
            if (bytes.length > 900000 || await gitBlobSha(bytes) !== file.sha)
                throw Error('Genvägsregistrets filhash kunde inte verifieras.');
            return { sha: file.sha, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
        },
        async writeBookmarks(expectedSha, content) {
            if (repository !== GITHUB_REPO || expectedSha !== null && !/^[a-f0-9]{40}$/.test(expectedSha || ''))
                throw Error('Ogiltig registerversion.');
            const bytes = new TextEncoder().encode(content);
            if (bytes.length > 900000)
                throw Error('Genvägsregistret är för stort.');
            const hash = await gitBlobSha(bytes);
            const response = await call(filePath('System/nexus-bookmarks.json'), { method: 'PUT', body: JSON.stringify({ message: 'Nexus Hub: uppdatera sparade dokumentgenvägar', branch: 'main', ...(expectedSha ? { sha: expectedSha } : {}), content: base64(bytes) }) });
            const result = await response.json();
            if (result.content?.sha !== hash || !/^[a-f0-9]{40}$/.test(result.commit?.sha || ''))
                throw Error('GitHub-kvittensen kunde inte verifieras. Läs om registret före nästa försök.');
            return { sha: hash, commit: result.commit.sha };
        },
        async readStoryRegister() {
            if (repository !== GITHUB_REPO)
                throw Error('Berättelseregistret finns bara i Databas.');
            const response = await call(filePath('Berattelser/register.json') + '?ref=main');
            if (response.status === 404)
                return { sha: null, content: '{"schemaVersion":1,"entries":{}}' };
            const file = await response.json();
            if (file.encoding !== 'base64' || typeof file.content !== 'string' || !/^[a-f0-9]{40}$/.test(file.sha || ''))
                throw Error('GitHub gav inte ett komplett berättelseregister.');
            const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
            if (bytes.length > 900000 || await gitBlobSha(bytes) !== file.sha)
                throw Error('Berättelseregistrets filhash kunde inte verifieras.');
            return { sha: file.sha, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
        },
        async writeStoryRegister(expectedSha, content) {
            if (repository !== GITHUB_REPO || expectedSha !== null && !/^[a-f0-9]{40}$/.test(expectedSha || ''))
                throw Error('Ogiltig registerversion.');
            const bytes = new TextEncoder().encode(content);
            if (bytes.length > 900000)
                throw Error('Berättelseregistret är för stort.');
            const hash = await gitBlobSha(bytes);
            const response = await call(filePath('Berattelser/register.json'), { method: 'PUT', body: JSON.stringify({ message: 'Nexus Hub: uppdatera berättelseregister och omdömen', branch: 'main', ...(expectedSha ? { sha: expectedSha } : {}), content: base64(bytes) }) });
            const result = await response.json();
            if (result.content?.sha !== hash || !/^[a-f0-9]{40}$/.test(result.commit?.sha || ''))
                throw Error('GitHub-kvittensen kunde inte verifieras. Läs om registret före nästa försök.');
            return { sha: hash, commit: result.commit.sha };
        },
        async upload(id, name, bytes) {
            if (repository !== GITHUB_REPO)
                throw Error('Sidan får bara skapa dokument i Databas/00-Inkorg/.');
            if (bytes.byteLength > GITHUB_UPLOAD_LIMIT)
                throw Error('Filen är sparad lokalt. GitHub-överföring stöder högst 10 MB per fil i denna version.');
            const path = inboxPath(id, name), sha = await gitBlobSha(bytes), endpoint = filePath(path);
            const existing = await call(endpoint);
            if (existing.ok) {
                const found = await existing.json();
                if (found.sha !== sha)
                    throw Error('Sökvägen innehåller en annan fil. Ingenting skrevs över.');
                return { state: 'sent', path, blobSha: sha, url: found.html_url, reconciled: true };
            }
            const saved = await call(endpoint, { method: 'PUT', body: JSON.stringify({ message: 'Nexus Hub: dokument till inkorgen', content: base64(bytes) }) });
            if (!saved.ok)
                throw Error('GitHub kunde inte skapa filen.');
            const result = await saved.json();
            if (result.content?.sha !== sha)
                throw Error('GitHub-svaret kunde inte verifieras. Kontrollera status före nytt försök.');
            return { state: 'sent', path, blobSha: sha, commit: result.commit.sha, url: result.content.html_url, reconciled: false };
        }
    };
}
