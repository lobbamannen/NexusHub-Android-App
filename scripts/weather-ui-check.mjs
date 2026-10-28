import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{stdio:'ignore'});
let browser;let activePage;
try{
 const url='http://127.0.0.1:5174/tests/ui/weather-preview.html';
 for(let i=0;i<60;i++){try{const r=await fetch(url);if(r.ok)break;}catch{};await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 await fs.mkdir('weather-ui',{recursive:true});
 for(const width of [320,412,900]){
  const page=activePage=await browser.newPage({viewport:{width,height:950},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByText('Prognos nära nu',{exact:true}).waitFor();await page.getByText('Lägg till widget',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.nh-weather-temperature')?.textContent==='7°');assert.equal(await page.locator('.nh-weather-temperature').innerText(),'7°');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'no horizontal page overflow at '+width);
  const home=await page.locator('.nh-home-weather').boundingBox(),sync=await page.locator('.nh-home-sync').boundingBox();assert.ok(home.x+home.width<=sync.x,'home weather and GitHub status do not overlap');
  await page.screenshot({path:`weather-ui/weather-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Visa alla prognosdagar'}).click();assert.ok(await page.locator('.nh-weather-day').count()>5);
  await page.locator('.nh-weather-place').click();await page.getByLabel('Sök efter en ort').fill('Hässleholm');await page.getByRole('button',{name:'Sök',exact:true}).click();await page.locator('.nh-weather-place-results').getByRole('button',{name:/Hässleholm/}).waitFor();
  await page.getByRole('button',{name:'Ange plats och koordinater'}).click();await page.getByLabel('Platsnamn',{exact:true}).fill('Test');await page.getByLabel('Latitud',{exact:true}).fill('91');await page.getByLabel('Longitud',{exact:true}).fill('13');await page.getByRole('button',{name:'Använd plats',exact:true}).click();await page.getByRole('alert').filter({hasText:'giltiga koordinater'}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Weather UI: 320/412/900px screenshots, overflow/corner geometry, forecast expansion, place search and invalid coordinate validation passed (recorded fixture, not live native bridge).');
}catch(error){if(activePage){console.error('WEATHER_UI_FAILURE_BODY',await activePage.locator('body').innerText().catch(()=>''));await activePage.screenshot({path:'weather-ui/failure.png',fullPage:true}).catch(()=>{});}throw error;}finally{if(browser)await browser.close();server.kill();}
