import { ideaPath, validateIdea, ideaContent, sameIdea } from './ideas.mjs';

/** Restricted to one UUID file per idea; no arbitrary-path or other-repo writes. */
export function ideasGithub(repository, call, gitBlobSha, base64) {
    const scoped = () => { if (repository !== 'lobbamannen/Databas') throw Error('Idéer hör endast till Databas.'); };
    const conflict = () => Object.assign(Error('Idén har ändrats i GitHub. Din text finns kvar lokalt; läs GitHub-versionen innan du fortsätter.'), { status: 409 });
    async function decode(file, id) {
        if (file.encoding !== 'base64' || typeof file.content !== 'string' || !/^[a-f0-9]{40}$/.test(file.sha || '')) throw Error('GitHub gav inte en komplett idéfil.');
        const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
        if (bytes.length > 350000 || await gitBlobSha(bytes) !== file.sha) throw Error('Idéfilens hash kunde inte verifieras.');
        const idea = validateIdea(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
        if (idea.id !== id) throw Error('Idéfilens ID matchar inte sökvägen.');
        return { idea, sha: file.sha };
    }
    async function readIdea(id) {
        scoped(); const path = ideaPath(id);
        const response = await call('/contents/' + path + '?ref=main');
        if (response.status === 404) return null;
        if (!response.ok) throw Error('Idén kunde inte läsas från GitHub.');
        return decode(await response.json(), id);
    }
    async function listIdeas() {
        scoped(); const response = await call('/git/trees/main?recursive=1');
        if (!response.ok) throw Error('Idélistan kunde inte hämtas från GitHub.');
        const data = await response.json();
        if (data.truncated || !Array.isArray(data.tree)) throw Error('GitHubs filträd är ofullständigt; idélistan kan inte verifieras.');
        const files = data.tree.filter(f => f.type === 'blob' && /^Ideer\/[^/]+\.json$/.test(f.path) && f.path !== 'Ideer/schema.json');
        const items = [];
        for (let offset = 0; offset < files.length; offset += 4) {
            const batch = await Promise.all(files.slice(offset, offset + 4).map(async f => {
                const id = f.path.slice(6, -5); ideaPath(id);
                const blob = await call('/git/blobs/' + f.sha);
                if (!blob.ok) throw Error('En idéfil kunde inte läsas.');
                const file = await blob.json();
                if (file.sha !== f.sha) throw Error('Idéfilens hash avviker från filträdet.');
                return decode(file, id);
            }));
            items.push(...batch);
        }
        return { items: items.sort((a, b) => b.idea.updatedAt.localeCompare(a.idea.updatedAt)), source: 'github', fetchedAt: new Date().toISOString() };
    }
    async function saveIdea(idea, expectedSha) {
        scoped(); validateIdea(idea);
        if (expectedSha !== null && !/^[a-f0-9]{40}$/.test(expectedSha || '')) throw Error('Ogiltig idéversion.');
        const current = await readIdea(idea.id);
        // A lost response after a committed PUT is a read-only success, not another write.
        if (current && sameIdea(current.idea, idea)) return { ...current, saved: true, source: 'github', reconciled: true };
        if ((current?.sha || null) !== expectedSha) throw conflict();
        if (current && current.idea.createdAt !== idea.createdAt) throw Error('Skapandetid får inte ändras.');
        const bytes = new TextEncoder().encode(ideaContent(idea)), hash = await gitBlobSha(bytes);
        const response = await call('/contents/' + ideaPath(idea.id), { method: 'PUT', body: JSON.stringify({ message: 'Nexus Hub: ' + (expectedSha ? 'uppdatera idé' : 'spara ny idé'), branch: 'main', ...(expectedSha ? { sha: expectedSha } : {}), content: base64(bytes) }) });
        if (!response.ok) throw conflict();
        const receipt = await response.json();
        if (receipt.content?.sha !== hash || !/^[a-f0-9]{40}$/.test(receipt.commit?.sha || '')) throw Error('GitHub-kvittensen kunde inte verifieras. Idén väntar lokalt; försök igen för återläsning.');
        return { idea, sha: hash, commit: receipt.commit.sha, saved: true, source: 'github' };
    }
    return { listIdeas, readIdea, saveIdea };
}
