import { validatePlanMetadata } from '@/lib/idea-plans.mjs';
import { github } from '@/lib/github';
import { validateIdea } from '@/lib/ideas.mjs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
    try {
        const id = new URL(request.url).searchParams.get('id');
        const data = id ? await github().readIdea(id) : await github().listIdeas();
        return data ? json(data) : json({ error: 'Idén finns inte i GitHub.' }, 404);
    } catch (error: any) { return json({ error: error.message }, error.status === 401 || error.status === 403 ? 403 : 503); }
}
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return json({ error: 'Otillåtet ursprung.' }, 403);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 350000) return json({ error: 'Idén är för stor.' }, 413);
        let input: any;
        try { input = JSON.parse(raw); validateIdea(input.idea); if (input.expectedSha !== null && !/^[a-f0-9]{40}$/.test(input.expectedSha || '')) throw Error('Ogiltig idéversion.'); }
        catch (error: any) { return json({ error: error.message }, 400); }
        if(input.idea.status === 'ready') {
          try {
            const client=github(),folder='Fardiga-ideer/'+input.idea.id+'/';
            const meta:any=await client.browse(folder+'metadata.json');
            const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(meta.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
            validatePlanMetadata(decoded,input.idea.id);
            const plan=await client.browse(folder+'implementation-plan.md'), research=await client.browse(folder+'research.md');
            if(plan.type!=='file'||research.type!=='file') throw Error('Plan och research måste vara filer.');
          } catch { return json({error:'Spara först ett komplett planpaket med metadata, implementationsplan och research i Fardiga-ideer/'+input.idea.id+'/.'},400); }
        }
        return json(await github().saveIdea(input.idea, input.expectedSha));
    } catch (error: any) { return json({ saved: false, error: error.message }, error.status === 409 || error.status === 422 ? 409 : error.status === 401 || error.status === 403 ? 403 : 503); }
}

/** Deletion is explicit and online only; it is never replayed from an outbox. */
export async function DELETE(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return json({error:'Otillåtet ursprung.'},403);
        const raw = await request.text();
        if (raw.length > 1000) return json({error:'Ogiltig radering.'},400);
        let input: any;
        try { input = JSON.parse(raw); } catch { return json({error:'Ogiltig radering.'},400); }
        return json(await github().deleteIdea(input.id, input.expectedSha));
    } catch (error: any) { return json({deleted:false,error:error.message},error.status === 409 || error.status === 422 ? 409 : error.status === 401 || error.status === 403 ? 403 : 503); }
}
