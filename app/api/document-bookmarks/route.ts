import { github } from '@/lib/github';
import { applyBookmarks, validateBookmarks } from '@/lib/document-bookmarks.mjs';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const read = async () => { const file = await github('databas').readBookmarks(); return { ...file, register: validateBookmarks(JSON.parse(file.content)) }; };
export async function GET() { try {
    return reply({ ...await read(), source: 'github' });
}
catch {
    return reply({ error: 'Dokumentgenvägar kunde inte läsas från GitHub.' }, 503);
} }
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin)
            return reply({ error: 'Otillåtet ursprung.' }, 403);
        if (!request.headers.get('content-type')?.includes('application/json'))
            return reply({ error: 'Förväntade JSON.' }, 415);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 250000)
            return reply({ error: 'För stor ändring.' }, 413);
        const input = JSON.parse(raw), client = github('databas');
        for (let attempt = 0; attempt < 5; attempt++) {
            const current = await read(), next = applyBookmarks(current.register, input, new Date().toISOString()), content = JSON.stringify(next, null, 2) + '\n';
            if (current.sha && JSON.stringify(current.register) === JSON.stringify(next))
                return reply({ saved: true, register: current.register, sha: current.sha, source: 'github' });
            try {
                const result = await client.writeBookmarks(current.sha, content);
                return reply({ saved: true, register: next, ...result, source: 'github' });
            }
            catch (e: any) {
                if (e.status !== 409 && e.status !== 422)
                    throw e;
            }
        }
        return reply({ error: 'GitHub ändrades samtidigt. Försök igen; dina lokala genvägar finns kvar.' }, 409);
    }
    catch (e: any) {
        return reply({ error: e.status === 400 || e instanceof SyntaxError ? e.message : 'Dokumentgenvägen kunde inte sparas i GitHub. Försök läsa om innan du sparar igen.' }, e.status === 400 || e instanceof SyntaxError ? 400 : 503);
    }
}
