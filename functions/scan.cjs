'use strict';
// Trusted external worker. Run on a restricted host with ClamAV and current signatures.
// The browser and the portal API cannot mark any file clean.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const projectId=process.env.GCLOUD_PROJECT||'nppappointment';
if(projectId!=='nppappointment'||!process.env.STORAGE_BUCKET)throw Error('Set the actual nppappointment bucket name in STORAGE_BUCKET.');
initializeApp({projectId,credential:applicationDefault(),storageBucket:process.env.STORAGE_BUCKET});
const db=getFirestore();
async function main(){const pending=await db.collection('scanQueue').where('state','==','pending').limit(50).get();for(const s of pending.docs){const x=s.data();if(!/^quarantine\/[a-f0-9]{64}\/[a-f0-9-]{36}$/.test(x.path))continue;const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aeec-'));try{const file=path.join(dir,'attachment');await getStorage().bucket().file(x.path).download({destination:file});const result=spawnSync('clamscan',['--no-summary',file],{timeout:120000,stdio:'ignore'});if(result.status!==0&&result.status!==1)continue;const state=result.status===0?'clean':'infected';await db.runTransaction(async t=>{const q=await t.get(s.ref);if(q.data()?.state!=='pending')return;const a=db.collection('applications').doc(x.application);const snap=await t.get(a);if(snap.exists){const docs=snap.data().documents;if(docs.some(f=>f.id===s.id&&f.path===x.path))t.update(a,{documents:docs.map(f=>f.id===s.id?{...f,scan:state}:f)});}t.update(s.ref,{state,scannedAt:Date.now()});t.create(db.collection('audit').doc(),{actor:'scanner',action:'file_'+state,ref:x.application,at:Date.now()});});}catch(e){console.error('Scan failed for queue item',s.id,e.code||'error');}finally{await fs.rm(dir,{recursive:true,force:true});}}console.log('Scan batch finished. Pending items remain blocked.');}
main().catch(e=>{console.error('Scan worker failed',e.code||'error');process.exitCode=1;});
