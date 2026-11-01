import { github } from '@/lib/github';
import { gitBlobSha } from '@/lib/github-inbox.mjs';
import { applyEconomyCatalogEdit, combineEconomyCatalogRead, validateEconomyCatalog } from '@/lib/economy-catalog.mjs';
import { validateEconomyArticles } from '@/lib/economy-articles.mjs';

export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const BUDGETS = ['Ekonomi/Robin/budget.json', 'Ekonomi/Rebecca/budget.json'];
const CATEGORY_PATH = 'Ekonomi/Katalog/kategorier.json';
const PRODUCT_PATH = 'Ekonomi/Katalog/produkter.json';
const periodFile = (path: string) => /^Ekonomi\/Gemensamt\/20\d{2}\/20\d{2}-\d{2}-\d{2}\.json$/.test(path);
const catalogFile = (path: string) => path === CATEGORY_PATH || path === PRODUCT_PATH;
const allowed = (path: string) => BUDGETS.includes(path) || periodFile(path) || catalogFile(path);
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
function text(value: unknown, label: string, max = 280): string {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail('Ogiltigt fält: ' + label);
    return value.trim();
}
function money(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000 || Math.abs(Math.round(value * 100) - value * 100) > 0.000001) fail('Ogiltigt belopp: ' + label);
    return value;
}
function isRealDate(value: string): boolean {
    const [year,month,day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(0);
    parsed.setUTCHours(0,0,0,0);
    parsed.setUTCFullYear(year,month-1,day);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth()+1 === month && parsed.getUTCDate() === day;
}
function date(value: unknown): string | null {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isRealDate(value)) fail('Ange datum som ÅÅÅÅ-MM-DD.');
    return value;
}
function verifyBudget(value: any) {
    if (!object(value) || value.schema_version !== 1 || !Array.isArray(value.entries) || value.entries.length > 1000) fail('Okänt budgetformat.', 503);
    return value;
}
function verifyPeriod(value: any) {
    if (!object(value) || value.schema_version !== 1 || !Array.isArray(value.purchases) || value.purchases.length > 2000) fail('Okänt periodformat.', 503);
    return value;
}
async function read(path: string, ref?: string) {
    if (!allowed(path)) fail('Ekonomifilen är inte tillåten.');
    const file: any = await github('databas').browse(path, ref || null);
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || !/^[a-f0-9]{40}$/.test(file.sha || '')) fail('Ekonomifilen kunde inte läsas.', 503);
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
    if (bytes.byteLength > 900000 || await gitBlobSha(bytes) !== file.sha) fail('Ekonomifilens kontrollsumma avviker.', 503);
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (path === CATEGORY_PATH) validateEconomyCatalog(value, 'categories');
    else if (path === PRODUCT_PATH) validateEconomyCatalog(value, 'products');
    else (periodFile(path) ? verifyPeriod : verifyBudget)(value);
    return { path, sha: file.sha, data: value };
}
function changes(kind: 'budget' | 'purchase', input: any) {
    if (!object(input)) fail('Ändringen saknar fält.');
    const permit = kind === 'budget' ? ['name', 'type', 'monthly_amount_sek'] : ['description', 'category', 'date', 'amount_sek', 'articles', 'status'];
    if (!Object.keys(input).length || Object.keys(input).some(k => !permit.includes(k))) fail('Ändringen innehåller otillåtna fält.');
    const result: Record<string, any> = {};
    if ('name' in input) result.name = text(input.name, 'namn');
    if ('type' in input) result.type = text(input.type, 'typ', 100);
    if ('monthly_amount_sek' in input) result.monthly_amount_sek = money(input.monthly_amount_sek, 'månadsbelopp');
    if ('description' in input) result.description = text(input.description, 'beskrivning', 400);
    if ('category' in input) result.category = text(input.category, 'kategori', 160);
    if ('date' in input) result.date = date(input.date);
    if ('amount_sek' in input) result.amount_sek = money(input.amount_sek, 'köpbelopp');
    if ('articles' in input) result.articles = validateEconomyArticles(input.articles);
    if ('status' in input) result.status = text(input.status, 'status', 120);
    return result;
}
function apply(current: any, path: string, input: any) {
    const kind = BUDGETS.includes(path) ? 'budget' : 'purchase';
    const field = kind === 'budget' ? 'entries' : 'purchases';
    const list = current[field] as any[];
    if (!['create', 'update'].includes(input.action)) fail('Ogiltig åtgärd.');
    const id = text(input.id, 'ID', 120);
    if (input.action === 'create' && !/^[a-zA-Z0-9_-][a-zA-Z0-9_:-]{2,119}$/.test(id)) fail('Ogiltigt nytt post-ID.');
    const indexes = list.map((row, i) => row.id === id ? i : -1).filter(i => i >= 0);
    const patch = changes(kind, input.changes);
    if (input.action === 'create') {
        if (indexes.length) fail('Den här posten finns redan. Läs om registret.', 409);
        const required = kind === 'budget' ? ['name', 'type', 'monthly_amount_sek'] : ['description', 'category', 'amount_sek', 'date'];
        if (required.some(k => !(k in patch))) fail('Alla obligatoriska fält behöver fyllas i.');
        const entry = kind === 'budget' ? { id, ...patch } : {
            id, source_transaction_row: null, date: null, date_source_text: patch.date || 'Datum saknas',
            description: '', amount_sek: 0, category: 'Gemensamt – övrigt', status: 'Registrerad i Nexus Hub',
            note: null, paid_by: null, source_payee_account: null, articles: [], article_sum_sek: null,
            article_reconciliation: 'no_articles', ...patch,
        };
        if (kind === 'purchase') summarizeArticles(entry);
        return { ...current, [field]: [...list, entry] };
    }
    if (indexes.length !== 1) fail('Posten saknas eller ID är inte unikt. Läs om registret.', 409);
    const updated = list.slice(), entry = { ...updated[indexes[0]], ...patch };
    if (kind === 'purchase') summarizeArticles(entry);
    updated[indexes[0]] = entry;
    return { ...current, [field]: updated };
}
function summarizeArticles(entry: any) {
    const rows = Array.isArray(entry.articles) ? entry.articles : [];
    const total = Math.round(rows.reduce((sum: number, row: any) => sum + (row.line_amount_sek || 0), 0) * 100) / 100;
    entry.article_sum_sek = rows.length ? total : null;
    entry.article_reconciliation = !rows.length ? 'no_articles' : Math.abs(total - entry.amount_sek) <= .01 ? 'matches' : 'differs';
}
export async function GET() {
    try {
        const client = github('databas');
        const snapshot: any = await client.snapshot();
        if (snapshot.truncated) fail('GitHubs filinventering är ofullständig.', 503);
        const periodPaths = snapshot.tree.filter((item: any) => item.type === 'blob' && periodFile(item.path)).map((item: any) => item.path).sort();
        if (periodPaths.length > 60) fail('För många ekonomiperioder för denna vy.', 503);
        const paths = [...BUDGETS, ...periodPaths];
        const [files, categories, products] = await Promise.allSettled([
            Promise.all(paths.map(path => read(path, snapshot.commit))),
            read(CATEGORY_PATH, snapshot.commit), read(PRODUCT_PATH, snapshot.commit),
        ]);
        if (files.status === 'rejected') throw files.reason;
        const result = combineEconomyCatalogRead(categories.status === 'fulfilled' ? categories.value : null,
            products.status === 'fulfilled' ? products.value : null);
        return reply({ files: files.value, ...result, commit: snapshot.commit, retrievedAt: new Date().toISOString() });
    } catch (e: any) { return reply({ error: e.message || 'Ekonomiregistret kunde inte läsas.' }, e.status || 503); }
}
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return reply({ error: 'Otillåtet ursprung.' }, 403);
        if (!/application\/json/i.test(request.headers.get('content-type') || '')) return reply({ error: 'Förväntade JSON.' }, 415);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 100000) return reply({ error: 'För stor ändring.' }, 413);
        const input = JSON.parse(raw);
        if (!object(input) || typeof input.path !== 'string' || !allowed(input.path) || !/^[a-f0-9]{40}$/.test(input.expectedSha || '')) fail('Ogiltig ekonomifil eller versionsnyckel.');
        const current = await read(input.path);
        if (current.sha !== input.expectedSha) return reply({ error: 'Ekonomifilen ändrades i GitHub. Dina ändringar är kvar; läs om innan du sparar.' }, 409);
        let next;
        if (catalogFile(input.path)) {
            if (input.action !== 'upsert' || typeof input.kind !== 'string' || !object(input.entry) ||
                Object.keys(input).some(key => !['path','expectedSha','action','kind','entry'].includes(key))) fail('Ogiltig katalogändring.');
            if (input.path === CATEGORY_PATH && !['category','group'].includes(input.kind)) fail('Fel katalogtyp.');
            if (input.path === PRODUCT_PATH && input.kind !== 'product') fail('Fel katalogtyp.');
            const reference = input.path === PRODUCT_PATH ? (await read(CATEGORY_PATH)).data :
                input.kind === 'group' ? (await read(PRODUCT_PATH)).data : null;
            next = applyEconomyCatalogEdit(current.data, input.kind, input.entry, reference);
        } else next = apply(current.data, input.path, input);
        const content = JSON.stringify(next, null, 2) + '\n';
        const saved = await github('databas').writeEconomyFile(input.path, current.sha, content);
        return reply({ saved: true, path: input.path, sha: saved.sha, commit: saved.commit, data: next });
    } catch (e: any) {
        const status = e?.status === 409 || e?.status === 422 ? 409 : e?.status === 401 || e?.status === 403 ? 403 : e?.status >= 500 ? 503 : 400;
        return reply({ error: status === 409 ? 'Ekonomifilen ändrades samtidigt. Inget skrevs över. Läs om registret.' : e?.message || 'Kunde inte spara ekonomi.' }, status);
    }
}
