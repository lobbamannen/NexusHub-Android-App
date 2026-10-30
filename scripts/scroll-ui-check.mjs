import {chromium} from 'playwright';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5180'],{stdio:'ignore'});let browser;
try{
 const url='http://127.0.0.1:5180/tests/ui/scroll-preview.html';for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});await fs.mkdir('scroll-ui',{recursive:true});
 for(const reducedMotion of ['no-preference','reduce'])for(const width of [320,412]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:true,hasTouch:true,reducedMotion}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByRole('heading',{name:'Hem',exact:true}).waitFor();const cdp=await page.context().newCDPSession(page);
  const swipe=async()=>{await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width-12,y:700}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width-12,y:700-i*55}]});await page.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>scrollY>80);assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'hidden');};
  const top=()=>page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  for(let round=0;round<4;round++){
   await top();await page.getByRole('button',{name:'Byt modul',exact:true}).click();await swipe();
   await top();await page.getByRole('button',{name:'Lägg till',exact:true}).click();await page.getByRole('button',{name:'Ny uppgift',exact:true}).click();await page.getByRole('dialog',{name:'Ny uppgift',exact:true}).waitFor();await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
   if(round%2)await page.getByTestId('native-back').evaluate(el=>el.click());else await page.getByRole('button',{name:'Stäng uppgiften och behåll utkast'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await swipe();
   await top();await page.getByRole('button',{name:'Snabbt byte',exact:true}).click();await page.getByRole('button',{name:'Stäng uppgiften och behåll utkast'}).click();await page.waitForTimeout(220);await swipe();
   await top();await page.getByRole('button',{name:'Klistra in',exact:true}).click();await page.getByRole('button',{name:'Avbryt och stäng'}).click();await swipe();
  }
  assert.equal(await page.evaluate(()=>window.__snapshotCalls),0);assert.equal(await page.locator('[data-nexus-motion]').count(),0);assert.deepEqual(errors,[]);await page.screenshot({path:`scroll-ui/scroll-restored-${width}-${reducedMotion}.png`});await page.close();
 }
 console.log('Touch scrolling verified after Android module changes, overlapping/rapid panel handoffs, close and native Back; normal/reduced motion at 320/412.');
}finally{await browser?.close();server.kill();}
