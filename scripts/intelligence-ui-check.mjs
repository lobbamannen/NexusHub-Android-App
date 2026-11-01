import {startUiTestServer} from './ui-test-server.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await startUiTestServer({port:5184,path:'/tests/ui/intelligence-preview.html'});let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});await fs.mkdir('intelligence-ui',{recursive:true});
 for(const width of [320,412,1000]){
  const page=await browser.newPage({viewport:{width,height:915}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url);const trigger=page.getByRole('button',{name:'Inställningar',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Globala Gemma-inställningar'});await dialog.waitFor();assert.equal(await page.getByRole('dialog').count(),1,'one labelled native dialog, without nested dialog roles');
  assert.equal(await page.locator('dialog').evaluate(el=>el.matches(':modal')),true);
  const first=dialog.locator('input,select,button').first();await first.evaluate(el=>el.focus());
  await page.keyboard.press('Shift+Tab');assert.equal(await dialog.getByRole('button',{name:'Stäng',exact:true}).evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('#outside').evaluate(el=>{el.focus();return el===document.activeElement}),false);
  await dialog.getByLabel('Temperature',{exact:true}).fill('0.8');await page.keyboard.press('Escape');
  await dialog.getByText('Du har osparade inställningar.',{exact:false}).waitFor();
  await page.screenshot({path:`intelligence-ui/unsaved-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'dialog overflow '+width);
  await dialog.getByRole('button',{name:'Fortsätt redigera'}).click();await dialog.getByRole('button',{name:'Stäng',exact:true}).click();await dialog.getByRole('button',{name:'Kasta ändringar'}).click();
  await dialog.waitFor({state:'detached'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  await trigger.click();assert.equal(await dialog.getByLabel('Temperature',{exact:true}).inputValue(),'0.7');await dialog.getByRole('button',{name:'Stäng',exact:true}).click();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Gemma native HTML modal verified at 320/412/1000: real background inertness, reverse Tab, unsaved Escape/close, discard and focus restoration.');
}finally{await browser?.close();await server.stop();}
