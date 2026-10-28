import test from 'node:test';
import assert from 'node:assert/strict';
import {temperature,precipitation,conditionLabel,dayLabel,weatherTime,validLocation} from '../lib/weather/presentation.mjs';
test('missing and invalid weather values never become zero',()=>{for(const n of [null,undefined,NaN,Infinity,9999])assert.equal(temperature(n),'—');assert.equal(temperature(-2.4),'−2°');assert.equal(temperature(0),'0°');assert.equal(temperature(2.5),'3°');assert.equal(temperature(-3.5),'−3°');});
test('precipitation keeps the provider interval visible',()=>{assert.equal(precipitation(null,1),'—');assert.equal(precipitation(.8,6),'0,8 mm / 6 h');assert.equal(precipitation(0,1),'0 mm / 1 h');});
test('unknown condition and provider time are explicit',()=>{assert.equal(conditionLabel('made-up'),'Väderuppgift saknas');assert.equal(weatherTime(null,'Europe/Stockholm'),'—');assert.equal(weatherTime(Date.parse('2026-10-28T16:00:00Z'),'Europe/Stockholm'),'17:00');});
test('date labels use the forecast location timezone and date',()=>{assert.equal(dayLabel('2026-10-29','Europe/Stockholm',Date.parse('2026-10-28T23:30:00Z')),'I dag');});
test('place validation rejects out of range coordinates and invalid timezone',()=>{assert.equal(validLocation({name:'Torup',latitude:56.15,longitude:13.4833,timeZone:'Europe/Stockholm'}),true);for(const p of [{name:'',latitude:56,longitude:13,timeZone:'UTC'},{name:'X',latitude:91,longitude:13,timeZone:'UTC'},{name:'X',latitude:56,longitude:13,timeZone:'nonsense'}])assert.equal(validLocation(p),false);});
