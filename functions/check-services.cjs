'use strict';
// Trusted operator only. Read-only checks; no user data or credentials printed.
const {initializeApp, applicationDefault, deleteApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const {getDatabase}=require('firebase-admin/database');
const {ADMIN_UID}=require('./provision.cjs');
const projectId='nppappointment';
const databaseURL='https://nppappointment-default-rtdb.firebaseio.com';
const storageBucket='nppappointment.firebasestorage.app';
if(Object.keys(process.env).some(k=>k.endsWith('_EMULATOR_HOST')&&process.env[k]))throw Error('Disable emulator environment variables before running this production check.');
const app=initializeApp({projectId,databaseURL,storageBucket,credential:applicationDefault()});
const checks=[];
async function check(name,fn){
 let timer;
 try{
  const detail=await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Timeout'),{code:'timeout'})),15000);})]);
  console.log('PASS '+name+(detail?' — '+detail:''));checks.push(true);
 }catch(e){const code=String(e.code||e.status||'unknown').replace(/[^a-zA-Z0-9_/-]/g,'').slice(0,80);console.error('FAIL '+name+' — '+code);checks.push(false);}
 finally{clearTimeout(timer);}
}
async function main(){
 await check('Firebase Auth: nominated administrator',async()=>{
  const u=await getAuth(app).getUser(ADMIN_UID);
  if(u.disabled||!u.emailVerified||!u.email)throw Object.assign(Error('Account not ready'),{code:'admin-email-not-verified-or-disabled'});
  return u.multiFactor?.enrolledFactors?.length?'MFA enrolled':'MFA enrolment still required';
 });
 await check('Firestore default database',async()=>{await getFirestore(app).collection('vacancies').limit(1).get();});
 await check('Private Storage bucket',async()=>{await getStorage(app).bucket().getMetadata();});
 await check('Realtime Database (connectivity only)',async()=>{
  const db=getDatabase(app);
  try{await db.ref('__portal_connectivity__').once('value');}finally{db.goOffline();}
 });
 console.log('Operator credential checks only. Run npm run check:live to test deployed runtime access separately.');
 if(checks.some(x=>!x))process.exitCode=1;
}
main().catch(()=>{console.error('Operator check aborted. Verify ADC configuration.');process.exitCode=1;}).finally(async()=>{await deleteApp(app);});
