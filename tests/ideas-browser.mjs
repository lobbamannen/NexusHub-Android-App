// Optional integration smoke. Uses isolated GitHub responses, never real repositories.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const server = !process.env.NEXUS_TEST_URL ? await (await import('vite')).createServer({server:{host:'127.0.0.1',port:5173,strictPort:true}}) : null;
await server?.listen();
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const options = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], headless: true } : { headless: true };
const browser = await chromium.launch(options);
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
await context.addInitScript(() => { window.Android = { getGithubToken: () => 'isolated-test-token', setGithubToken: () => true }; });
const sha = text => createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
const files = new Map(Object.entries({
    'Filmer/register.json': { schemaVersion: 1, films: [] }, 'Serier/register.json': { schemaVersion: 1, series: [] },
    'Berattelser/register.json': { schemaVersion: 1, entries: {} }, 'Berattelser/lasstatus.json': { schemaVersion: 1, entries: {} },
    'Ekonomi/Robin/budget.json': {schema_version:1,entries:[{id:'rent',name:'Hyra test',type:'Fast utgift',monthly_amount_sek:100}]},
    'Ekonomi/Rebecca/budget.json': {schema_version:1,entries:[]},
    'Ekonomi/Gemensamt/2026/2026-10-19.json': {schema_version:1,period:{start_date:'2026-10-19'},purchases:[{id:'receipt',date:'2026-10-19',description:'Testbutik',amount_sek:10,articles:[{name:'OKÄND ARTIKEL',line_amount_sek:10}]}]},
    'Ekonomi/Katalog/kategorier.json': {schema_version:1,categories:[{id:'hushall',name:'Hushåll'}],groups:[{id:'elektronik',name:'Elektronik',category_id:'hushall',aliases:[]}],legacy_category_map:{}},
    'Ekonomi/Katalog/produkter.json': {schema_version:1,products:[{id:'goji-stylus-black',name:'Goji penna',group_id:'elektronik',aliases:['Goji Fine Tip styluspenna, svart']}]},
    'System/nexus-bookmarks.json': { schemaVersion: 1, entries: {} }, 'catalog.json': { plugins: [] },
}).map(([path, data]) => [path, JSON.stringify(data)]));
let failWrites = false, loseResponse = false, writes = 0;
await context.route('https://api.github.com/**', async route => {
    const request = route.request(), url = new URL(request.url()), plugin = url.pathname.includes('/ChatGPT-Plugin');
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const tree = () => [...files].filter(([p]) => plugin ? p === 'catalog.json' : p !== 'catalog.json').map(([path, text]) => ({ path, type: 'blob', mode: '100644', sha: sha(text), size: Buffer.byteLength(text) }));
    if (url.pathname.endsWith('/commits')) return json([{ sha: 'a'.repeat(40), commit: { message: 'Isolated test', committer: { date: new Date().toISOString() } }, html_url: 'https://example.invalid/commit' }]);
    if (url.pathname.includes('/git/trees/')) return json({ truncated: false, tree: tree() });
    if (url.pathname.includes('/git/blobs/')) {
        const entry = [...files].find(([, text]) => url.pathname.endsWith(sha(text)));
        return entry ? json({ sha: sha(entry[1]), encoding: 'base64', content: Buffer.from(entry[1]).toString('base64') }) : json({}, 404);
    }
    if (url.pathname.includes('/contents/')) {
        const path = decodeURIComponent(url.pathname.split('/contents/')[1]);
        if (request.method() === 'PUT') {
            assert.match(path, /^(Ideer\/[a-f0-9-]+|Ekonomi\/(?:Robin|Rebecca)\/budget|Ekonomi\/Katalog\/(?:kategorier|produkter))\.json$/); writes++;
            if (failWrites) return json({}, 503);
            const body = request.postDataJSON(), old = files.get(path);
            if (old ? body.sha !== sha(old) : body.sha !== undefined) return json({}, 409);
            const text = Buffer.from(body.content, 'base64').toString('utf8'); files.set(path, text);
            if (loseResponse) { loseResponse = false; return route.abort('failed'); }
            return json({ content: { sha: sha(text) }, commit: { sha: 'b'.repeat(40) } });
        }
        const text = files.get(path);
        return text ? json({ name: path.split('/').at(-1), path, size: Buffer.byteLength(text), sha: sha(text), encoding: 'base64', content: Buffer.from(text).toString('base64') }) : json({}, 404);
    }
    return json({ full_name: plugin ? 'lobbamannen/ChatGPT-Plugin' : 'lobbamannen/Databas', default_branch: 'main' });
});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const text = page.getByRole('textbox', { name: 'Vad har du på gång?' });
const save = () => page.getByRole('button', { name: 'Spara', exact: true }).click();
const close = () => page.getByRole('button', { name: 'Stäng idén och behåll utkast' }).click();
async function wait(predicate, description) { const until = Date.now() + 12000; while (Date.now() < until) { if (await predicate()) return; await new Promise(r => setTimeout(r, 100)); } throw Error(description); }
try {
    await page.goto(process.env.NEXUS_TEST_URL || 'http://127.0.0.1:5173');
    await page.locator('.nh-art-ideas').waitFor();
    await page.getByRole('button', { name: 'Lägg till', exact: true }).click();
    await page.getByRole('button', { name: 'Ny idé', exact: true }).click();
    await text.fill('En tanke som ska överleva omstart 💡');
    await close(); await page.reload();
    await page.locator('.nh-art-ideas').click();
    await page.locator('.nh-idea-card').filter({ hasText: 'En tanke' }).click();
    assert.equal(await text.inputValue(), 'En tanke som ska överleva omstart 💡');
    assert.equal(writes, 0, 'draft never writes automatically');
    await save(); await page.getByRole('dialog').getByText('Sparad i GitHub', { exact: true }).waitFor();
    const path = [...files.keys()].find(p => p.startsWith('Ideer/'));
    assert.equal(JSON.parse(files.get(path)).text, 'En tanke som ska överleva omstart 💡');
    await text.fill('En tanke som ska överleva omstart 💡\nFortsättning tre dagar senare.');
    await page.getByLabel('Idéstatus', { exact: true }).selectOption('investigating');
    await save(); await page.getByRole('dialog').getByText('Sparad i GitHub', { exact: true }).waitFor();
    assert.equal([...files.keys()].filter(p => p.startsWith('Ideer/')).length, 1);
    assert.equal(JSON.parse(files.get(path)).status, 'investigating');
    failWrites = true; await text.fill('Väntande text'); await save();
    await wait(() => page.getByRole('button', { name: 'Försök igen' }).isEnabled(), 'pending attempt finished');
    assert.equal(await text.getAttribute('readonly'), '');
    const writesBefore = writes; await close(); await page.reload();
    await page.locator('.nh-idea-card').filter({ hasText: 'Väntande text' }).click();
    assert.equal(await text.inputValue(), 'Väntande text'); assert.equal(writes, writesBefore);
    failWrites = false;
    await page.getByRole('button', { name: 'Försök igen' }).click();
    await page.getByRole('dialog').getByText('Sparad i GitHub', { exact: true }).waitFor();
    assert.equal(JSON.parse(files.get(path)).text, 'Väntande text');
    // Conflict keeps local text and makes no PUT using a substituted SHA.
    await text.fill('Mitt lokala konfliktutkast');
    const external = { ...JSON.parse(files.get(path)), text: 'Extern GitHub-ändring' }; files.set(path, JSON.stringify(external));
    const beforeConflict = writes; await save(); await page.getByRole('dialog').getByText('Konflikt – din text finns kvar', { exact: true }).waitFor();
    assert.equal(writes, beforeConflict); assert.equal(await text.inputValue(), 'Mitt lokala konfliktutkast');
    await page.getByRole('button', { name: 'Visa GitHub-versionen' }).click();
    await page.getByRole('button', { name: 'Använd GitHub-versionen' }).click();
    await wait(async () => await text.inputValue() === 'Extern GitHub-ändring', 'explicit remote resolution');
    await text.fill('Ångra detta'); await page.getByRole('button', { name: 'Ångra utkast' }).click();
    await wait(async () => await page.getByRole('dialog').count() === 0, 'editor closes after undo');
    assert.equal(JSON.parse(files.get(path)).text, 'Extern GitHub-ändring');
    // Lost successful PUT must resolve by GET on the explicit retry.
    await page.getByRole('button', { name: 'Ny idé', exact: true }).click(); await text.fill('Förlorad kvittens'); loseResponse = true; await save();
    await wait(() => page.getByRole('button', { name: 'Försök igen' }).isEnabled(), 'pending attempt finished'); const beforeRetry = writes;
    await page.getByRole('button', { name: 'Försök igen' }).click(); await page.getByRole('dialog').getByText('Sparad i GitHub', { exact: true }).waitFor();
    assert.equal(writes, beforeRetry, 'reconcile without duplicate PUT');
    await close();
    for (const [status, label] of [['completed', 'Genomförd'], ['dismissed', 'Avfärdad']]) {
        await page.locator('.nh-idea-card').filter({ hasText: 'Förlorad kvittens' }).click(); await page.getByLabel('Idéstatus', { exact: true }).selectOption(status); await save(); await page.getByRole('dialog').getByText('Sparad i GitHub', { exact: true }).waitFor(); await close();
        await page.getByRole('group', {name:'Filtrera idéstatus'}).getByRole('button', { name: new RegExp('^' + label) }).click(); assert.equal(await page.locator('.nh-idea-card').count(), 1);
    }
    await page.getByRole('button', { name: /^Alla/ }).click();
    await page.screenshot({ path: '/tmp/nexus-ideas-list.png', fullPage: true });
    await page.getByRole('button', {name:'Öppna meny'}).click();
    await page.getByRole('button', {name:'Ekonomi',exact:true}).click();
    await page.getByRole('button', {name:/^Register Alla/}).click();
    await page.getByRole('button', {name:/Hyra test/}).click();
    await page.getByRole('button', {name:'Redigera och spara',exact:true}).click();
    const economyForm=page.getByRole('form',{name:'Redigera ekonomipost'});
    await economyForm.getByLabel('Post',{exact:true}).fill('Hyra ändrat test'); failWrites=true;
    await economyForm.getByRole('button',{name:'Spara i GitHub',exact:true}).click();
    await wait(()=>economyForm.getByRole('button',{name:'Avbryt',exact:true}).isEnabled(),'economy write failed');
    assert.match(await economyForm.innerText(),/Väntar på synk/);
    assert.match(await economyForm.getByRole('alert').innerText(),/503/);
    assert.equal(await page.evaluate(async()=>(await (await import('/platform/outbox.ts')).pendingWrites()).filter(w=>w.path==='/api/economy').length),1);
    await page.evaluate(async()=>{await (await import('/platform/outbox.ts')).cancelQueuedEdits('all-drafts');});
    assert.equal(await page.evaluate(async()=>(await (await import('/platform/outbox.ts')).pendingWrites()).filter(w=>w.path==='/api/economy').length),1,'unrelated film/story discard must retain economy');
    await economyForm.getByRole('button',{name:'Avbryt',exact:true}).click();
    await wait(async()=>await economyForm.count()===0,'economy cancelled');
    assert.equal(await page.evaluate(async()=>(await (await import('/platform/outbox.ts')).pendingWrites()).filter(w=>w.path==='/api/economy').length),0);
    assert.equal(JSON.parse(files.get('Ekonomi/Robin/budget.json')).entries[0].name,'Hyra test');
    await page.getByRole('button',{name:'Ny post',exact:true}).click();
    const newEconomyForm=page.getByRole('form',{name:'Skapa ekonomipost'});
    await newEconomyForm.getByLabel('Vilket register?').selectOption('Ekonomi/Robin/budget.json');
    await newEconomyForm.getByLabel('Post',{exact:true}).fill('Nytt test');
    await newEconomyForm.getByLabel('Kronor per månad',{exact:true}).fill('10');
    await newEconomyForm.getByRole('button',{name:'Spara i GitHub',exact:true}).click();
    await wait(()=>newEconomyForm.getByRole('button',{name:'Avbryt',exact:true}).isEnabled(),'new economy failure');
    assert.equal(await newEconomyForm.getByLabel('Vilket register?').isEnabled(),false,'target cannot change after pending save');
    await newEconomyForm.getByRole('button',{name:'Avbryt',exact:true}).click();
    await wait(async()=>await newEconomyForm.count()===0,'new economy cancelled');
    failWrites=false;
    await page.getByRole('button',{name:'Tillbaka till Ekonomi',exact:true}).click();
    await page.getByRole('button',{name:/^Kategorier & produkter/}).click();
    await page.getByRole('button',{name:'Produkter',exact:true}).click();
    await page.getByRole('button',{name:/Goji penna/}).click();
    const catalogForm=page.getByRole('form',{name:'Redigera katalogpost'});
    await catalogForm.getByRole('button',{name:'Spara i GitHub',exact:true}).click();
    await wait(async()=>await catalogForm.count()===0,'catalog saved');
    assert.deepEqual(JSON.parse(files.get('Ekonomi/Katalog/produkter.json')).products[0].aliases,['Goji Fine Tip styluspenna, svart']);
    await page.getByRole('button',{name:'Koppla',exact:true}).click(); failWrites=true;
    await page.getByRole('button',{name:'Spara koppling',exact:true}).click();
    await wait(()=>page.getByRole('button',{name:'Spara koppling',exact:true}).isEnabled(),'alias link failure');
    assert.equal(await page.getByLabel('Produktgrupp').isEnabled(),false,'pending alias target cannot switch');
    await page.getByRole('button',{name:'Avbryt',exact:true}).click();
    await wait(async()=>await page.getByRole('button',{name:'Spara koppling',exact:true}).count()===0,'alias linking cancelled');
    assert.equal(await page.evaluate(async()=>(await (await import('/platform/outbox.ts')).pendingWrites()).filter(w=>w.path==='/api/economy').length),0);
    console.log('PASS economy: failed save visible inside editor, pending indicator, Avbryt removes queue item, unchanged comma alias survives catalog save.');

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    assert.deepEqual(errors, []);
    console.log('PASS: create, durable draft/restart, update same idea, all statuses, pending/restart/retry, SHA conflict, explicit resolution, undo, lost-response reconciliation; no real GitHub writes.');
} catch (e) {
    console.error(await page.locator('body').innerText()); await page.screenshot({ path: '/tmp/nexus-ideas-failure.png', fullPage: true }); throw e;
} finally { await browser.close(); await server?.close(); }
