import {chromium} from 'playwright';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5175'],{stdio:'ignore'});let browser,page;
try{
 const url='http://127.0.0.1:5175/tests/ui/calendar-preview.html';for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});await fs.mkdir('calendar-ui',{recursive:true});
 for(const width of [320,412,900]){
  page=await browser.newPage({viewport:{width,height:950},deviceScaleFactor:1});await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('CALENDAR_PAGE_ERROR',e.message)});await page.goto(url);
  await page.locator('.nh-calendar-v2').waitFor();await page.getByRole('button',{name:/Visa händelser för 2026-11-11/}).waitFor();
  // Native range request is asynchronous; wait for an actual named preview before testing day expansion.
  await page.getByText('Projektavstämning',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.nh-calendar-v2').getAttribute('data-day-open'),'false');
  const outside=page.locator('.nh-calendar-cell').filter({has:page.getByRole('button',{name:'Visa händelser för 2026-10-28',exact:true})});
  await outside.locator('.nh-calendar-more').click();await page.waitForTimeout(350);
  assert.equal(await page.locator('.nh-calendar-v2').getAttribute('data-day-open'),'true');
  await page.getByRole('button',{name:'Visa händelser för 2026-11-11',exact:true}).waitFor();
  await page.getByRole('button',{name:'Stäng dagens händelser'}).click();await page.waitForTimeout(350);
  const before=await page.locator('.nh-calendar-grid').boundingBox();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'no calendar page overflow at '+width);
  await page.screenshot({path:`calendar-ui/month-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/Visa händelser för 2026-11-11/}).click();await page.waitForTimeout(350);
  assert.equal(await page.locator('.nh-calendar-v2').getAttribute('data-day-open'),'true');
  const after=await page.locator('.nh-calendar-grid').boundingBox();assert.ok(after.height<before.height-10,'month shrinks using layout at '+width);
  const panel=page.locator('.nh-calendar-day-panel');await panel.getByText('Planeringsmöte för kommande projekt och gemensamma aktiviteter',{exact:true}).waitFor();await panel.getByText('Testlokal A',{exact:true}).first().waitFor();
  await page.screenshot({path:`calendar-ui/day-${width}.png`,fullPage:true});
  await panel.getByRole('button').filter({hasText:'Planeringsmöte för kommande projekt'}).click();await page.getByRole('dialog',{name:'Händelsedetaljer'}).waitFor();await page.getByRole('button',{name:'Stäng kalenderfönstret'}).click();
  await page.getByRole('button',{name:/Visa händelser för 2026-11-11/}).click();await page.waitForTimeout(350);assert.equal(await page.locator('.nh-calendar-v2').getAttribute('data-day-open'),'false');
  await page.getByRole('button',{name:/Visa händelser för 2026-11-12/}).click();await panel.getByText(/Inga händelser/).waitFor();await page.screenshot({path:`calendar-ui/empty-${width}.png`,fullPage:true});
  await panel.getByRole('button',{name:/Ny händelse|Skapa/}).first().click();await page.getByRole('dialog',{name:'Egen kalenderhändelse'}).waitFor();assert.ok((await page.getByLabel(/^Start/).inputValue()).startsWith('2026-11-12'));await page.getByRole('button',{name:'Stäng kalenderfönstret'}).click();
  // Root's native-back adapter must close the inline day panel before navigating away.
  await page.getByTestId('native-back').evaluate(el=>el.click());await page.waitForTimeout(350);assert.equal(await page.locator('.nh-calendar-v2').getAttribute('data-day-open'),'false');
  await page.getByRole('button',{name:'Visa händelser för 2026-11-11',exact:true}).click();await page.waitForTimeout(350);
  const list=page.locator('.nh-calendar-day-events');assert.ok(await list.evaluate(el=>el.scrollHeight>el.clientHeight),'day events scroll independently');
  const handle=await page.locator('.nh-calendar-panel-handle').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+10);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y+90,{steps:8});await page.mouse.up();await page.waitForTimeout(350);assert.equal(await page.locator('.nh-calendar-v2').getAttribute('data-day-open'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.nh-calendar-cell').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  assert.deepEqual(errors,[]);await page.close();page=null;
 }
 console.log('Calendar UI: large month, actual layout contraction, same-day toggle, full details/location, empty-day create, native-back and overflow checks passed at320/412/900px (synthetic fixtures).');
}catch(error){if(page){console.error('CALENDAR_UI_FAILURE_DOM',await page.locator('.nh-calendar-grid').evaluate(el=>el.outerHTML.slice(0,16000)).catch(()=>''));console.error('CALENDAR_UI_FAILURE_BODY',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:'calendar-ui/failure.png',fullPage:false}).catch(()=>{});}throw error;}finally{if(browser)await browser.close();server.kill();}
