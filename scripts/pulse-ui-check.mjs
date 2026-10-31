import {chromium} from 'playwright';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const runId=randomUUID();
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5181','--strictPort'],{stdio:'ignore',env:{...process.env,NEXUS_TEST_RUN_ID:runId}});let browser;
try{
 const url='http://127.0.0.1:5181/tests/ui/pulse-preview.html';let ready=false;
 for(let i=0;i<60;i++){
  if(server.exitCode!==null)throw Error('Vite avslutades före UI-testet.');
  try{const response=await fetch(url,{cache:'no-store'});if(response.ok){const identity=await fetch('http://127.0.0.1:5181/__nexus-test-run',{cache:'no-store'});if(identity.ok&&(await identity.text())===runId){ready=true;break;}}}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 if(!ready)throw Error('Rätt Vite-server kunde inte verifieras.');
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});await fs.mkdir('pulse-ui',{recursive:true});
 for(const width of [320,412,900]){
  const page=await browser.newPage({viewport:{width:Math.max(width,320),height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByRole('button',{name:width+' px',exact:true}).click();
  await page.getByRole('region',{name:'Just nu i NexusHub'}).waitFor();
  const chrome=await page.locator('.nh-home-weather,.nh-home-sync').evaluateAll(nodes=>nodes.map(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return {border:c.borderTopWidth,background:c.backgroundImage,color:c.backgroundColor,shadow:c.boxShadow,height:r.height};}));assert.equal(chrome.length,2);for(const c of chrome){assert.equal(c.border,'0px');assert.equal(c.background,'none');assert.equal(c.color,'rgba(0, 0, 0, 0)');assert.equal(c.shadow,'none');assert.ok(c.height>=32);}assert.equal(await page.locator('.nh-pulse-counters button').count(),3);assert.equal(await page.locator('.nh-pulse-action').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal overflow '+width);
  await page.getByRole('button',{name:'3 nya idéer idag'}).click();await page.waitForFunction(()=>document.querySelector('output')?.textContent?.includes('ideer'));assert.match(await page.locator('output').innerText(),/ideer/);
  const center=await page.locator('.nh-pulse-counters').evaluate(el=>{const items=Array.from(el.children),first=items[0].getBoundingClientRect(),last=items.at(-1).getBoundingClientRect(),parent=el.getBoundingClientRect();return Math.abs((first.left+last.right)/2-(parent.left+parent.right)/2);});assert.ok(center<2,'counter group stays centered '+width);assert.equal(await page.getByText('Senast hämtade uppgifter',{exact:true}).count(),0);
  for(const amount of [1,2,3]){await page.getByRole('button',{name:amount+' kategorier',exact:true}).click();assert.equal(await page.locator('.nh-pulse-counters button').count(),amount);const distance=await page.locator('.nh-pulse-counters').evaluate(el=>{const rows=Array.from(el.children),a=rows[0].getBoundingClientRect(),b=rows.at(-1).getBoundingClientRect(),r=el.getBoundingClientRect();return Math.abs((a.left+b.right-r.left-r.right)/2);});assert.ok(distance<2,'dynamic centered group '+amount);}
  await page.screenshot({path:`pulse-ui/pulse-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Öppna testfilm'}).click();await page.getByRole('heading',{name:'Filmdetaljer'}).waitFor();await page.getByRole('button',{name:'Tillbaka till affischen'}).click();await page.getByRole('button',{name:'Öppna testfilm'}).waitFor();
  await page.waitForFunction(()=>!document.documentElement.dataset.nexusMotion);assert.equal(await page.locator('[style*="view-transition-name"]').count(),0);
  const pulseStyle=await page.locator('.nh-pulse').evaluate(el=>{const c=getComputedStyle(el);return {border:c.borderTopWidth,background:c.backgroundImage,shadow:c.boxShadow};});assert.deepEqual(pulseStyle,{border:'0px',background:'none',shadow:'none'});
  await page.getByRole('button',{name:'Töm aktivitet'}).click();assert.equal(await page.locator('.nh-pulse').count(),0);
  await page.getByRole('button',{name:'Öppna panel'}).click();await page.getByRole('dialog',{name:'Testpanel'}).waitFor();await page.getByRole('button',{name:'Stäng panel'}).click();await page.getByRole('dialog',{name:'Testpanel'}).waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.nh-welcome-light').count(),0);
  const surfaces=await page.locator('.nh-pulse,.nh-pulse-counters button').evaluateAll(nodes=>nodes.map(el=>{const css=getComputedStyle(el);return {border:css.borderTopWidth,background:css.backgroundImage,shadow:css.boxShadow};}));for(const surface of surfaces){assert.equal(surface.border,'0px');assert.equal(surface.background,'none');assert.equal(surface.shadow,'none');}
  assert.deepEqual(errors,[]);await page.close();
 }

 for(const rejectCapture of [false,true]){
  const page=await browser.newPage({viewport:{width:412,height:950}});
  await page.addInitScript(reject=>{
   if(reject)Object.defineProperty(document,'startViewTransition',{value:()=>{throw Error('fixture capture rejected');},configurable:true});
   else Object.defineProperty(document,'startViewTransition',{value:undefined,configurable:true});
   window.__fallbackMotions=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.__fallbackMotions.push({tag:this.tagName,duration:options.duration});return original.call(this,frames,options);};
  },rejectCapture);
  await page.goto(url);await page.getByRole('button',{name:'3 nya idéer idag'}).click();await page.waitForFunction(()=>document.querySelector('output')?.textContent?.includes('ideer'));
  const recorded=await page.evaluate(()=>window.__fallbackMotions);assert.ok(recorded.some(x=>x.tag==='MAIN'&&x.duration>=250),'real module content fallback animation, rejected='+rejectCapture);
  await page.emulateMedia({reducedMotion:'reduce'});const before=recorded.length;await page.getByRole('button',{name:'2 nya filmer idag'}).click();await page.waitForFunction(()=>document.querySelector('output')?.textContent?.includes('filmer'));assert.equal(await page.evaluate(()=>window.__fallbackMotions.length),before);await page.close();
 }
 console.log('Pulse UI passed: 320/412/900px, conditional counters/actions, routes, selected poster forward/back, cleanup, panels and reduced motion. Fixture, not phone APK.');
}finally{await browser?.close();server.kill();}
