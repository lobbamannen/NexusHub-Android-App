import { github } from '@/lib/github';
import { saveMirror } from '@/lib/mirror';
import { applyFilmChange } from '@/lib/films.mjs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const read = async () => { const source = await github('databas').readFilmRegister(); return { ...source, register: JSON.parse(source.content) }; };
export async function GET() {
    try {
        const data = await read();
        return reply({ sha: data.sha, register: data.register });
    }
    catch (e: any) {
        return reply({ error: e.message || 'Filmregistret kunde inte läsas.' }, e.status || 503);
    }
}
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin)
            return reply({ error: 'Otillåtet ursprung.' }, 403);
        if (Number(request.headers.get('content-length') || 0) > 120000)
            return reply({ error: 'Ändringen är för stor.' }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 120000)
            return reply({ error: 'Ändringen är för stor.' }, 413);
        const input: any = JSON.parse(raw);
        if (!input || typeof input !== 'object' || input.action !== 'update' || !/^[a-f0-9]{40}$/.test(input.expectedSha || ''))
            return reply({ error: 'Ogiltig ändring eller saknad versionsnyckel.' }, 400);
        const current = await read();
        if (input.expectedSha !== current.sha)
            return reply({ error: 'Filmregistret ändrades i GitHub sedan du öppnade det. Kopiera dina ändringar vid behov och ladda om innan du sparar.' }, 409);
        const next = applyFilmChange(current.register, input.action, input.film);
        const content = JSON.stringify(next, null, 2) + '\n';
        const client = github('databas');
        const result = await client.writeFilmRegister(current.sha, content);
        let mirrored = true, warning: string | null = null;
        try {
            const bytes = new TextEncoder().encode(content);
            await saveMirror('databas', { path: 'Filmer/register.json', sha: result.sha, size: bytes.byteLength, fetchedAt: new Date().toISOString() }, bytes.buffer, result.commit);
        }
        catch (e: any) {
            mirrored = false;
            warning = 'Ändringen är sparad i GitHub men spegeln uppdaterades inte direkt. Den ordinarie synkfunktionen kan hämta den. ' + e.message;
        }
        return reply({ saved: true, sha: result.sha, commit: result.commit, mirrored, warning, register: next });
    }
    catch (e: any) {
        const status = e.status === 409 || e.status === 422 ? 409 : e.status === 401 || e.status === 403 ? 403 : e.status && e.status >= 500 ? 503 : 400;
        return reply({ error: status === 409 ? 'GitHub avvisade uppdateringen. Registret kan ha ändrats; ladda om innan du sparar igen.' : e.message || 'Det gick inte att spara filmen.' }, status);
    }
}
