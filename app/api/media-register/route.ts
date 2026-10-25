import { github } from '@/lib/github';
import { saveMirror } from '@/lib/mirror';
import { gitBlobSha } from '@/lib/github-inbox.mjs';
export const dynamic = 'force-dynamic';
const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
import { validatedPatch } from '@/lib/media-validation.mjs';
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
async function readSeries() {
    const file: any = await github('databas').browse('Serier/register.json');
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || !/^[a-f0-9]{40}$/.test(file.sha || ''))
        fail('GitHub levererade inte ett giltigt serieregister.', 503);
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
    if (bytes.byteLength > 900000 || await gitBlobSha(bytes) !== file.sha)
        fail('Serieregistrets GitHub-hash kunde inte verifieras.', 503);
    const register = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (register?.schemaVersion !== 1 || !Array.isArray(register.series))
        fail('Okänt serieregisterformat.', 503);
    return { sha: file.sha, register };
}
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin)
            return respond({ error: 'Otillåtet ursprung.' }, 403);
        if (!/application\/json/i.test(request.headers.get('content-type') || ''))
            return respond({ error: 'Förväntade JSON.' }, 415);
        if (Number(request.headers.get('content-length') || 0) > 250000)
            return respond({ error: 'För många ändringar.' }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 250000)
            return respond({ error: 'För många ändringar.' }, 413);
        const input: any = JSON.parse(raw);
        if (!input || !['films', 'series'].includes(input.kind) || !/^[a-f0-9]{40}$/.test(input.expectedSha || '') || !Array.isArray(input.edits) || input.edits.length < 1 || input.edits.length > 500)
            return respond({ error: 'Ogiltig ändringslista eller versionsnyckel.' }, 400);
        const kind: 'films' | 'series' = input.kind;
        const file = kind === 'films'
            ? await github('databas').readFilmRegister()
            : await readSeries();
        if (file.sha !== input.expectedSha)
            return respond({ error: 'Registret har ändrats i GitHub sedan du öppnade det. Dina osparade ändringar finns kvar; läs om registret innan du försöker spara igen.' }, 409);
        const register = kind === 'films' ? JSON.parse((file as any).content) : (file as any).register;
        if (kind === 'films' && (!['1.0.0', '1.3.0'].includes(register.schemaVersion) || !Array.isArray(register.films)))
            fail('Okänt filmregisterformat.', 503);
        const entries: any[] = kind === 'films' ? register.films : register.series;
        const updated = entries.slice();
        const used = new Set<number>();
        let changed = 0;
        for (const edit of input.edits) {
            if (!edit || typeof edit !== 'object' || Array.isArray(edit))
                fail('Ogiltig registerrad.');
            const target = edit.target;
            let indexes: number[] = [];
            if (kind === 'films') {
                if (typeof target !== 'string' || !/^tt\d{7,9}$/.test(target))
                    fail('Ogiltigt film-ID.');
                indexes = entries.map((e, i) => e.imdbId === target ? i : -1).filter(i => i >= 0);
            }
            else {
                if (!target || typeof target.title !== 'string' || !target.title.trim() ||
                    (target.startYear !== null && !Number.isInteger(target.startYear)) ||
                    (target.imdbId != null && (typeof target.imdbId !== 'string' || !/^tt\d{6,12}$/.test(target.imdbId))))
                    fail('Ogiltig serieidentifierare.');
                indexes = entries.map((e, i) => e.title === target.title && e.startYear === target.startYear && (e.imdbId || null) === (target.imdbId || null) ? i : -1).filter(i => i >= 0);
            }
            if (indexes.length !== 1)
                fail('En titel saknas eller är inte unik. Uppdatera registret.', 409);
            const index = indexes[0];
            if (used.has(index))
                fail('Samma titel får bara ändras en gång.');
            used.add(index);
            const patch = validatedPatch(edit.changes, kind);
            const next = { ...entries[index], ...patch };
            if (kind === 'films') {
                if ('title' in patch || 'year' in patch)
                    next.displayTitle = next.title + ' – (' + next.year + ')';
                if ('status' in patch && patch.status !== entries[index].status)
                    next.statusEvidence = { type: 'direkt', note: 'Tittarstatus uppdaterad manuellt i Nexus Hub Register.' };
            }
            if (JSON.stringify(next) !== JSON.stringify(entries[index])) {
                updated[index] = next;
                changed++;
            }
        }
        if (kind === 'series') {
            const identifiers = updated.map(item => JSON.stringify([item.title, item.startYear ?? null, item.imdbId || null]));
            if (new Set(identifiers).size !== identifiers.length)
                fail('Ändringen skulle skapa två serier med samma identifierare. Ingen ändring sparades.');
        }
        if (!changed)
            return respond({ saved: true, unchanged: true, sha: file.sha, register });
        const nextRegister = { ...register, lastUpdated: new Date().toISOString().slice(0, 10), [kind]: updated };
        const content = JSON.stringify(nextRegister, null, 2) + '\n';
        const client = github('databas');
        const saved = kind === 'films'
            ? await client.writeFilmRegister(file.sha, content)
            : await client.writeSeriesRegister(file.sha, content);
        const path = kind === 'films' ? 'Filmer/register.json' : 'Serier/register.json';
        let warning: string | null = null;
        try {
            const bytes = new TextEncoder().encode(content);
            await saveMirror('databas', { path, sha: saved.sha, size: bytes.byteLength, fetchedAt: new Date().toISOString() }, bytes.buffer, saved.commit);
        }
        catch (e: any) {
            warning = 'Sparat i GitHub, men den lokala spegeln uppdaterades inte direkt. ' + (e?.message || '');
        }
        return respond({ saved: true, changed, sha: saved.sha, commit: saved.commit, warning, register: nextRegister });
    }
    catch (e: any) {
        const status = e?.status === 409 || e?.status === 422 ? 409 : e?.status === 401 || e?.status === 403 ? 403 : e?.status >= 500 ? 503 : 400;
        return respond({ error: status === 409 ? 'GitHub avvisade ändringen eller registret har uppdaterats. Dina osparade ändringar finns kvar.' : e?.message || 'Registret kunde inte sparas.' }, status);
    }
}
