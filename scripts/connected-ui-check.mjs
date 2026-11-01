import {startUiTestServer} from './ui-test-server.mjs';
import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const server=await startUiTestServer({port:5179,path:'/tests/ui/connected-preview.html'});let browser;
try{
 const url=server.url;
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});await fs.mkdir('connected-ui',{recursive:true});
 for(const width of [320,412,900]){
 const page=await browser.newPage({viewport:{width,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByRole('heading',{name:'Kopplingar & karta'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'graph overflow '+width);await page.screenshot({path:`connected-ui/connections-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Fokusera Lokal RAG och kunskap'}).click();await page.getByRole('button',{name:'Öppna innehållet'}).click();assert.match(await page.locator('output').innerText(),/Lokal RAG/);
 await page.getByRole('button',{name:'Tillbaka i kartan'}).click();await page.getByRole('button',{name:'Lägg till koppling',exact:true}).click();await page.getByRole('combobox',{name:'Koppla till',exact:true}).selectOption(nodesValue('Research/Comparison'));await page.getByLabel('Varför hör de ihop?').fill('Min verifierade koppling');await page.getByRole('button',{name:'Spara i GitHub',exact:true}).click();await page.getByText('Min verifierade koppling',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'training',exact:true}).click();await page.getByRole('button',{name:'Visa träning 2026-10-25',exact:true}).click();await page.getByRole('heading',{name:'Pass 2 · Rygg och armar',exact:true}).waitFor();assert.ok((await page.locator('table').first().innerText()).includes('—'));await page.screenshot({path:`connected-ui/training-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'training overflow '+width);
 await page.getByRole('button',{name:'Stäng träningsdag'}).click();await page.getByLabel('Övning',{exact:true}).fill('ansiktsdrag');await page.getByRole('heading',{name:'Träffar i hela arkivet'}).waitFor();await page.getByRole('button',{name:'Återställ filter'}).click();await page.getByRole('button',{name:'Nästa månad',exact:true}).click();await page.getByRole('heading',{name:'november 2026'}).waitFor();
 await page.getByRole('button',{name:'guardian',exact:true}).click();await page.getByRole('heading',{name:'Systemhälsa'}).waitFor();await page.screenshot({path:`connected-ui/guardian-${width}.png`,fullPage:true});assert.equal(await page.getByText('Avvikelse hittad',{exact:true}).count(),2);
 await page.getByRole('button',{name:'command',exact:true}).click();await page.getByLabel('Sök eller kommando').fill('öppna träning');await page.getByRole('button',{name:'Öppna Träningsarkivet'}).click();assert.equal(await page.locator('output').innerText(),'traning');await page.screenshot({path:`connected-ui/command-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Connected UI: production training calendar, map navigation, relation write, Guardian and Command verified at 320/412/900.');
}finally{await browser?.close();await server.stop();}
function nodesValue(path){return 'databas:'+path;}
