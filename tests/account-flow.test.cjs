'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {accountError}=require('../functions/policy.cjs');
const ui=()=>import('../src/account-flow.js');
const user={email:'demo@example.invalid',emailVerified:true,disabled:false,providerData:[{providerId:'password'}],tokensValidAfterTime:'2026-01-01T00:00:00Z'};
const token={email_verified:true,auth_time:Date.parse('2026-01-02T00:00:00Z')/1000,firebase:{sign_in_provider:'password'}};
test('backend account gate rejects no account and anonymous provider',()=>{
 assert.equal(accountError(null,null),'unauthenticated');
 assert.equal(accountError(user,{...token,firebase:{sign_in_provider:'anonymous'}}),'password_required');
 assert.equal(accountError({...user,providerData:[]},token),'password_required');
 assert.equal(accountError(user,token),null);
});
test('backend rejects unverified, disabled, suspended, revoked or malformed session',()=>{
 assert.equal(accountError({...user,emailVerified:false},token),'unverified');
 assert.equal(accountError(user,{...token,email_verified:false}),'unverified');
 assert.equal(accountError({...user,disabled:true},token),'unverified');
 assert.equal(accountError(user,token,{role:'applicant',active:false}),'disabled');
 assert.equal(accountError(user,{...token,auth_time:1}),'revoked');
 assert.equal(accountError(user,{...token,auth_time:undefined}),'revoked');
});
test('backend requires staff MFA and denies unknown roles',()=>{
 assert.equal(accountError(user,token,{role:'admin'}),'mfa_required');
 assert.equal(accountError(user,{...token,firebase:{...token.firebase,sign_in_second_factor:'totp'}},{role:'admin'}),null);
 assert.equal(accountError(user,token,{role:'unknown'}),'disabled');
});
test('all personal workspaces require sign-in and verification',async()=>{
 const {accountGate}=await ui();
 for(const route of ['dashboard','applications','application/abc123','notifications','sessions','reports','account','vacancies','security']){
  assert.equal(accountGate({route,user:null}),'login');
  assert.equal(accountGate({route,user:{emailVerified:false}}),'verify');
  assert.equal(accountGate({route,user:{emailVerified:true}}),'protected');
 }
 for(const route of ['home','positions','privacy','register','login','reset'])assert.equal(accountGate({route,user:null}),'public');
});
test('registration requires name, email, matching strong passwords and consent',async()=>{
 const {validateRegistration}=await ui();
 const valid={name:'Synthetic Applicant',email:'demo@example.invalid',password:'TestLongPassword1',confirmPassword:'TestLongPassword1',consent:true};
 assert.equal(validateRegistration(valid),null);
 for(const patch of [{name:' '},{email:''},{password:'short'},{confirmPassword:'different'},{consent:false}])assert.ok(validateRegistration({...valid,...patch}));
});
test('resume only allows safe internal destinations and MFA requires resolver',async()=>{
 const {safeDestination,accountGate}=await ui();
 assert.equal(safeDestination('application/abc123'),'application/abc123');
 for(const r of ['https://elsewhere.invalid','//elsewhere.invalid','application/<script>','login','register','security'])assert.equal(safeDestination(r),'dashboard');
 assert.equal(accountGate({route:'mfa',user:null}),'login');
 assert.equal(accountGate({route:'mfa',user:null,mfaPending:true}),'mfa');
});
