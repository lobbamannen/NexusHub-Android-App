import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {inline} from '../lib/inline.mjs';
const render=s=>renderToStaticMarkup(React.createElement('p',null,...inline(s)));
test('understrykning och nästlad Markdown renderas utan att ändra originalet',()=>{
 const text='<u>Familjeberättelsen i **senare** återgivning</u>';
 assert.equal(render(text),'<p><u>Familjeberättelsen i <strong>senare</strong> återgivning</u></p>');
 assert.equal(text,'<u>Familjeberättelsen i **senare** återgivning</u>');
});
test('kod behåller bokstavliga taggar och länkar har säkra attribut',()=>{
 assert.equal(render('`<u>kod</u>`'),'<p><code>&lt;u&gt;kod&lt;/u&gt;</code></p>');
 assert.match(render('[Källa](https://example.com)'),/rel="noopener noreferrer"/);
});
test('aktiv HTML och attribut renderas aldrig som HTML',()=>{
 for(const value of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','<u onclick="alert(1)">text</u>','[farlig](javascript:alert(1))']) {
  const result=render(value);assert.ok(!result.includes('<script>'));assert.ok(!result.includes('<img'));assert.ok(!result.includes('<u onclick'));assert.ok(!result.includes('href="javascript:'));
 }
});
test('vanliga betoningsformat och radbrytning stöds',()=>{
 assert.equal(render('*kursiv* ~~struken~~ <br> <em>betoning</em>'),'<p><em>kursiv</em> <del>struken</del> <br/> <em>betoning</em></p>');
});
