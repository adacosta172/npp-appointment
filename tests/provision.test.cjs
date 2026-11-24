'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {ADMIN_UID,bootstrapRole}=require('../functions/provision.cjs');
const P=require('../functions/policy.cjs');
const token={firebase:{sign_in_provider:'password'},email_verified:true,auth_time:Date.now()/1000};
const user={email:'demo@example.invalid',emailVerified:true,providerData:[{providerId:'password'}]};
test('only nominated UID gets candidate admin role, without decision authority',()=>{
 assert.deepEqual(bootstrapRole({uid:ADMIN_UID,token}),{role:'admin',authority:false});
 assert.equal(bootstrapRole({uid:'other',token,profile:{email:user.email}}),null);
});
test('initial admin cannot bypass verified email or MFA',()=>{
 const grant=bootstrapRole({uid:ADMIN_UID,token});
 assert.equal(P.accountError(user,token,grant),'mfa_required');
 assert.equal(P.accountError({...user,emailVerified:false},token,grant),'unverified');
 assert.equal(P.accountError(user,{...token,firebase:{...token.firebase,sign_in_second_factor:'totp'}},grant),null);
});
test('completed bootstrap, disabled account and non-password provider cannot auto-promote',()=>{
 for(const input of [{completed:true},{profile:{active:false}},{token:{firebase:{sign_in_provider:'anonymous'}}}])assert.equal(bootstrapRole({uid:ADMIN_UID,token,...input}),null);
});
test('existing authorised staff retain explicit authority, no new authority is granted',()=>{
 assert.deepEqual(bootstrapRole({uid:ADMIN_UID,token,profile:{role:'super',authority:true}}),{role:'super',authority:true});
 assert.deepEqual(bootstrapRole({uid:ADMIN_UID,token,profile:{role:'applicant',authority:true}}),{role:'admin',authority:false});
});
