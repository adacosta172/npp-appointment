'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('Realtime Database rules deny all direct reads and writes with no child grants',()=>{
  const rules=JSON.parse(fs.readFileSync(path.join(root,'database.rules.json'),'utf8'));
  assert.deepEqual(rules,{rules:{'.read':false,'.write':false}});
});
test('Firebase CLI uses the locked Realtime Database rules file',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
  assert.equal(config.database.rules,'database.rules.json');
});
