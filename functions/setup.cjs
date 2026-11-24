'use strict';
// Trusted operator terminal only. Never expose this script through the web API.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const positions=require('./positions.json');
const {DEADLINE}=require('./policy.cjs');
const {ADMIN_UID}=require('./provision.cjs');
const projectId=process.env.GCLOUD_PROJECT||'nppappointment';
if(projectId!=='nppappointment'&&!(projectId==='demo-nppappointment'&&process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Unexpected project.');
initializeApp({credential:applicationDefault(),projectId,databaseURL:projectId==='nppappointment'?'https://nppappointment-default-rtdb.firebaseio.com':'https://demo-nppappointment-default-rtdb.firebaseio.com'});
const db=getFirestore();
async function main(){
  const [mode,identifier,role,authority,...extra]=process.argv.slice(2);
  if(mode==='seed'&&!identifier){
    for(let i=0;i<positions.length;i++){
      const ref=db.collection('vacancies').doc('position-'+String(i+1).padStart(2,'0'));
      await db.runTransaction(async t=>{
        if(!(await t.get(ref)).exists)t.create(ref,{title:positions[i],description:'',requirements:[],published:false,opens:0,closes:DEADLINE-1});
      });
    }
    console.log('10 positions seeded as unpublished; authorised super administrator must confirm requirements and publish.');
    return;
  }
  if(!['staff','staff-uid'].includes(mode)||!identifier||!['super','admin','panel'].includes(role)||extra.length||(authority!==undefined&&authority!=='authority')||(role==='panel'&&authority)){
    throw Error('Use seed OR staff <verified-email> <super|admin|panel> [authority] OR staff-uid <uid> <super|admin|panel> [authority].');
  }
  const auth=getAuth();
  const u=mode==='staff-uid'?await auth.getUser(identifier):await auth.getUserByEmail(identifier);
  if(u.disabled||!u.emailVerified||!u.email)throw Error('Firebase account must be active and email verified.');
  const ref=db.collection('profiles').doc(u.uid);
  await db.runTransaction(async t=>{
    const existing=await t.get(ref);
    const old=existing.data()||{};
    if(old.active===false)throw Error('Profile is disabled; review its suspension separately before granting a role.');
    t.set(ref,{name:old.name||u.displayName||u.email,email:u.email,role,authority:role!=='panel'&&authority==='authority',active:true,created:old.created||Date.now()},{merge:true});
    if(u.uid===ADMIN_UID)t.set(db.collection('locks').doc('initial-admin-v71'),{at:Date.now()});
    t.create(db.collection('audit').doc(),{actor:'trusted-operator',action:'staff_role_set',ref:u.uid,role,authority:role!=='panel'&&authority==='authority',at:Date.now()});
  });
  await auth.revokeRefreshTokens(u.uid);
  console.log('Staff role saved for '+u.uid+'. Sign out, sign in again and complete authenticator enrolment if needed.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
