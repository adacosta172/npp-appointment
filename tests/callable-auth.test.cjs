'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const P=require('../functions/policy.cjs');
// Exercise the real callable handler with fake Firebase services, never a live project.
function fixture({user,profile,providerError}={}){
 const access=[];const logs=[];const exports={};
 class HttpsError extends Error{constructor(code,message,details){super(message);this.code=code;this.details=details;}}
 const db={collection(name){access.push(name);if(providerError)throw providerError;if(name!=='profiles')throw Error('Unexpected private data access: '+name);return {doc(){return {get:async()=>({exists:!!profile,data:()=>profile})};}};}};
 const mocks={'firebase-functions/v2/https':{onCall:(_options,handler)=>handler,HttpsError},'firebase-functions/v2/scheduler':{onSchedule:()=>{}},'firebase-admin/app':{initializeApp:()=>{}},'firebase-admin/auth':{getAuth:()=>({getUser:async()=>user})},'firebase-admin/firestore':{getFirestore:()=>db},'firebase-admin/storage':{getStorage:()=>{throw Error('Unexpected storage access');}},'node:crypto':require('node:crypto'),'./policy.cjs':P,'./provision.cjs':require('../functions/provision.cjs'),'./positions.json':require('../functions/positions.json')};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../functions/index.cjs'),'utf8'),{exports,process:{env:{}},console:{error:m=>logs.push(m)},require:n=>{if(!(n in mocks))throw Error('Unknown dependency '+n);return mocks[n];}});
 return {call:exports.portal,access,logs};
}
const token={email_verified:true,auth_time:Date.parse('2026-01-02T00:00:00Z')/1000,firebase:{sign_in_provider:'password'}};
const user={email:'demo@example.invalid',emailVerified:true,disabled:false,providerData:[{providerId:'password'}],tokensValidAfterTime:'2026-01-01T00:00:00Z'};
const privateOps=['me','profile','vacancies','vacancySave','createDraft','applications','application','draftSave','upload','submit','download','transition','withdraw','sessionCreate','sessions','schedule','attendance','assessment','assessments','notifications','notificationRead','summary','dailyReports','panelList'];
test('real callable rejects unauthenticated access to every private operation before database access',async()=>{
 const {call,access}=fixture();for(const op of privateOps)await assert.rejects(call({data:{op}}),{code:'unauthenticated'});assert.deepEqual(access,[]);
});
test('real callable rejects unverified and anonymous identities',async()=>{
 for(const [u,t] of [[{...user,emailVerified:false},token],[user,{...token,firebase:{sign_in_provider:'anonymous'}}]]){
  const {call,access}=fixture({user:u});await assert.rejects(call({auth:{uid:'demo',token:t},data:{op:'submit'}}),{code:'permission-denied'});assert.deepEqual(access,['profiles']);
 }
});
test('real callable requires a saved profile before allowing draft or submission operations',async()=>{
 const {call,access}=fixture({user});for(const op of ['createDraft','submit','upload','applications'])await assert.rejects(call({auth:{uid:'demo',token},data:{op}}),{code:'failed-precondition'});assert.ok(access.every(n=>n==='profiles'));
});
test('real callable rejects administrator without MFA before private dashboard access',async()=>{
 const {call,access}=fixture({user,profile:{role:'admin',active:true}});await assert.rejects(call({auth:{uid:'demo',token},data:{op:'summary'}}),{code:'permission-denied'});assert.deepEqual(access,['profiles']);
});

test('public health endpoint never reads private records',async()=>{
 const {call,access}=fixture();const health=await call({data:{op:'health'}});assert.equal(health.ok,true);assert.equal(health.release,'7.2.0');assert.deepEqual(access,[]);
});
for(const [code,description,category,status] of [[9,'Missing index: private-provider-detail','firestore_index','failed-precondition'],[5,'private-provider-detail','resource_missing','failed-precondition'],[7,'private-provider-detail','service_permissions','failed-precondition'],[14,'private-provider-detail','service_unavailable','unavailable'],['unexpected','private-provider-detail','backend_error','internal']]){
 test('callable safely reports '+category,async()=>{
  const {call,logs}=fixture({user,providerError:Object.assign(new Error(description),{code})});
  let caught;try{await call({auth:{uid:'demo',token},data:{op:'me'}});}catch(e){caught=e;}
  assert.equal(caught.code,status);assert.equal(caught.details.category,category);assert.match(caught.details.supportReference,/^ERR-[A-F0-9]{12}$/);assert.doesNotMatch(caught.message,/private-provider-detail/);assert.equal(logs.length,1);assert.doesNotMatch(logs[0],/private-provider-detail|demo@example|"uid"/);assert.equal(JSON.parse(logs[0]).supportReference,caught.details.supportReference);
 });
}
