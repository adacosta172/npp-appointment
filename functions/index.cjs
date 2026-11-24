'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const crypto=require('node:crypto');
const P=require('./policy.cjs');
const {ADMIN_UID,bootstrapRole}=require('./provision.cjs');
const positions=require('./positions.json');
// Cloud Functions supplies application default credentials and the project config.
// The RTDB URL is configured without moving any existing Firestore records.
const runtimeProject=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||'nppappointment';
initializeApp({projectId:runtimeProject,databaseURL:runtimeProject==='demo-nppappointment'
 ? 'https://demo-nppappointment-default-rtdb.firebaseio.com'
 : 'https://nppappointment-default-rtdb.firebaseio.com'});
const db=getFirestore();
const bucket=()=>getStorage().bucket(process.env.STORAGE_EMULATOR_HOST?'demo-nppappointment.appspot.com':'nppappointment.firebasestorage.app');
const col=n=>db.collection(n);
const err=(c,m)=>{throw new HttpsError(c,m);};
const str=(x,n,required=true)=>{if(typeof x!=='string'||x.length>n|| (required&&!x.trim()))err('invalid-argument','Check the required fields.');return x.trim();};
const id=x=>{if(typeof x!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(x))err('invalid-argument','Invalid record identifier.');return x;};
const doc=(n,k)=>col(n).doc(id(k));
const now=()=>Date.now();
const data=s=>{if(!s.exists)err('not-found','Record not found.');return {id:s.id,...s.data()};};
const staff=a=>{if(!P.staff(a.role))err('permission-denied','Administrator access required.');};
const superOnly=a=>{if(a.role!=='super')err('permission-denied','Super administrator access required.');};
const audit=(t,a,action,ref)=>t.create(col('audit').doc(),{actor:a.uid,action,ref,at:now()});
const notify=(t,uid,message,ref)=>t.create(col('notifications').doc(),{uid,message,ref,at:now(),read:false});
function owned(a,r){if(!P.canRead(a,r))err('permission-denied','Record is private.');}
function applicant(a){if(a.role!=='applicant')err('permission-denied','Applicant account required.');}
async function actor(req){
 if(!req.auth?.uid)err('unauthenticated','Create an account and sign in first.');
 const uid=req.auth.uid;const user=await getAuth().getUser(uid);const tok=req.auth.token;
 const ref=doc('profiles',uid);const s=await ref.get();let profile=s.exists?s.data():null;
 // A one-time server-side bootstrap for the nominated Firebase UID. The marker
 // prevents a later demotion from silently restoring staff privileges.
 if(uid===ADMIN_UID){
  const marker=doc('locks','initial-admin-v71');const mark=await marker.get();
  const grant=bootstrapRole({uid,profile,completed:mark.exists,token:tok});
  if(grant){
   const candidate={...profile,...grant};
   const gate=P.accountError(user,tok,candidate);
   if(gate==='mfa_required')err('permission-denied','Staff must sign in with Firebase multifactor authentication.');
   if(gate)err('permission-denied','Verify your email or sign in again.');
   profile=await db.runTransaction(async t=>{
    const [current,done]=await Promise.all([t.get(ref),t.get(marker)]);
    const old=current.exists?current.data():null;
    const next=bootstrapRole({uid,profile:old,completed:done.exists,token:tok});
    if(!next)return old;
    const result={...old,name:old?.name||user.displayName||user.email,email:user.email,...next,active:true,created:old?.created||now()};
    t.set(ref,result,{merge:true});t.create(marker,{at:now()});
    audit(t,{uid},'initial_admin_provisioned',uid);return result;
   });
  }
 }
 const gate=P.accountError(user,tok,profile);
 if(gate==='mfa_required')err('permission-denied','Staff must sign in with Firebase multifactor authentication.');
 if(gate==='password_required')err('permission-denied','Register and sign in with your email and password.');
 if(gate)err('permission-denied','Verify your email or sign in again.');
 return {uid,role:profile?.role||'applicant',authority:profile?.authority===true,email:user.email,profile};
}
async function initialiseCatalogue(a){
 // No existing vacancy or applicant record is overwritten. Publication remains a staff decision.
 const refs=positions.map((_,i)=>doc('vacancies','position-'+String(i+1).padStart(2,'0')));
 await db.runTransaction(async t=>{
  const existing=await Promise.all(refs.map(r=>t.get(r)));
  let added=0;
  for(let i=0;i<refs.length;i++)if(!existing[i].exists){t.create(refs[i],{title:positions[i],description:'',requirements:[],published:false,opens:0,closes:P.DEADLINE-1});added++;}
  if(added)audit(t,a,'catalogue_initialised',String(added));
 });
}
async function list(q){const s=await q.get();return s.docs.map(d=>({id:d.id,...d.data()}));}
function publicVac(v){return {id:v.id,title:v.title,description:v.description||'',requirements:v.requirements||[],published:v.published,opens:v.opens||0,closes:v.closes||P.DEADLINE-1,open:P.open(v)};}
function safeApp(a,r){if(P.staff(a.role))return r;const {internalNote,reviewer,...out}=r;return {...out,documents:(out.documents||[]).map(({path,...file})=>file)};}
const statuses=['submitted','under_review','changes_requested','approved_for_vetting','vetting_scheduled','vetted','decision_pending','appointed','reserve_list','unsuccessful','rejected_before_vetting','withdrawn'];
async function counts(){return Object.fromEntries(await Promise.all(statuses.map(async s=>[s,(await col('applications').where('status','==',s).where('submitted','==',true).count().get()).data().count])));}
// Public transport is required for Firebase callable browser clients; all private operations still authenticate and authorize in actor().
const options={region:'us-central1',invoker:'public',cors:true,maxInstances:10,timeoutSeconds:90,memory:'512MiB'};
async function handlePortal(req){
 const d=req.data||{};const op=d.op;
 if(op==='health')return {ok:true,release:'7.2.0'};
 if(op==='readiness'){await col('vacancies').limit(1).get();await bucket().getMetadata();return {ok:true,firestore:true,storage:true,release:'7.2.0'};}
 if(op==='catalogue'){return {positions:(await list(col('vacancies').where('published','==',true).limit(100))).map(publicVac),deadline:P.DEADLINE,serverNow:now()};}
 const a=await actor(req);
 if(op==='me')return {uid:a.uid,role:a.role,email:a.email,profile:a.profile,authority:a.authority};
 if(op==='profile'){const name=str(d.name,150);if(!a.profile&&d.consent!==true)err('invalid-argument','Accept the privacy notice.');await db.runTransaction(async t=>{const ref=doc('profiles',a.uid);const s=await t.get(ref);if(s.exists){if(s.data().active===false)err('permission-denied','Account disabled.');t.update(ref,{name});}else{if(d.consent!==true)err('invalid-argument','Accept the privacy notice.');t.create(ref,{name,email:a.email,role:'applicant',authority:false,active:true,created:now(),consentAt:now()});}audit(t,a,'profile_saved',a.uid);});return {ok:true};}
 if(!a.profile)err('failed-precondition','Complete your profile first.');
 if(op==='vacancies'){staff(a);await initialiseCatalogue(a);return list(col('vacancies').limit(100));}
 if(op==='vacancySave'){staff(a);const r=doc('vacancies',d.id);const description=str(d.description,4000,false);const requirements=(Array.isArray(d.requirements)?d.requirements:[]).slice(0,8).map(x=>str(x,100));if(new Set(requirements).size!==requirements.length)err('invalid-argument','Duplicate document requirement.');await db.runTransaction(async t=>{const s=await t.get(r);data(s);t.update(r,{description,requirements,published:d.published===true});audit(t,a,'vacancy_updated',r.id);});return {ok:true};}
 if(op==='createDraft'){applicant(a);const v=doc('vacancies',d.position);const key=crypto.createHash('sha256').update(a.uid+'|'+v.id).digest('hex');const r=doc('applications',key);return db.runTransaction(async t=>{const vs=data(await t.get(v));const old=await t.get(r);if(old.exists)return {id:r.id};if(!P.open(vs))err('failed-precondition','Applications are closed.');t.create(r,{uid:a.uid,position:v.id,title:vs.title,status:'draft',submitted:false,name:a.profile.name,email:a.email,phone:'',experience:'',qualifications:'',documents:[],requirements:vs.requirements||[],updated:now(),version:0,history:[]});audit(t,a,'draft_created',r.id);return {id:r.id};});}
 if(op==='applications'){let q=col('applications');if(P.staff(a.role))q=q.where('submitted','==',true);else if(a.role==='applicant')q=q.where('uid','==',a.uid);else err('permission-denied','Use assigned sessions.');q=q.orderBy('updated','desc');if(d.cursor){const s=await doc('applications',d.cursor).get();owned(a,data(s));q=q.startAfter(s);}const rows=await list(q.limit(50));return {rows:rows.map(r=>safeApp(a,r)),next:rows.length===50?rows.at(-1).id:null};}
 if(op==='application'){const r=doc('applications',d.id);const v=await db.runTransaction(async t=>{let x=data(await t.get(r));owned(a,x);if(a.role==='applicant'&&x.status==='draft'){const v=data(await t.get(doc('vacancies',x.position)));const requirements=v.requirements||[];if(JSON.stringify(requirements)!==JSON.stringify(x.requirements)){t.update(r,{requirements});x={...x,requirements};}}if(P.staff(a.role)&&x.status==='submitted'){const at=now();const history=[...x.history,{status:'under_review',at}];t.update(r,{status:'under_review',reviewer:a.uid,updated:at,history});audit(t,a,'review_opened',r.id);notify(t,x.uid,'Your application is under review.',r.id);x={...x,status:'under_review',history};}return x;});return safeApp(a,v);}
 if(op==='draftSave'){applicant(a);const r=doc('applications',d.id);const fields={phone:str(d.phone||'',40,false),experience:str(d.experience||'',8000,false),qualifications:str(d.qualifications||'',4000,false)};await db.runTransaction(async t=>{const x=data(await t.get(r));owned(a,x);if(x.uid!==a.uid||!['draft','changes_requested'].includes(x.status))err('failed-precondition','Application is locked.');if(x.status==='draft'&&now()>=P.DEADLINE||x.status==='changes_requested'&&now()>x.correctionDeadline)err('failed-precondition','Editing deadline passed.');t.update(r,{...fields,updated:now()});audit(t,a,'draft_saved',r.id);});return {ok:true};}
 if(op==='upload'){applicant(a);const r=doc('applications',d.id);const x=data(await r.get());owned(a,x);const label=str(d.label,100);const name=str(d.name,180);const payload=str(d.base64,7000000);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(payload))err('invalid-argument','Invalid file encoding.');const b=Buffer.from(payload,'base64');const type=P.fileType(b);const ext=name.split('.').at(-1).toLowerCase();if(b.length>5*1024*1024||!type||!({'application/pdf':['pdf'],'image/jpeg':['jpg','jpeg'],'image/png':['png']}[type].includes(ext)))err('invalid-argument','Only PDF, JPG and PNG up to 5 MB.');if(!['draft','changes_requested'].includes(x.status)||!x.requirements.includes(label))err('failed-precondition','Document is not requested or application locked.');const fileId=crypto.randomUUID();const path='quarantine/'+r.id+'/'+fileId;const file=bucket().file(path);await file.save(b,{resumable:false,metadata:{contentType:type,cacheControl:'private, no-store'}});try{await db.runTransaction(async t=>{const y=data(await t.get(r));owned(a,y);if(!['draft','changes_requested'].includes(y.status)||!y.requirements.includes(label)||(y.status==='draft'?now()>=P.DEADLINE:now()>y.correctionDeadline))err('failed-precondition','Application locked.');const entry={id:fileId,label,name,type,path,scan:'pending',size:b.length};t.update(r,{documents:[...y.documents.filter(f=>f.label!==label),entry],updated:now()});t.create(doc('scanQueue',fileId),{application:r.id,path,at:now(),state:'pending'});audit(t,a,'document_uploaded',r.id);});}catch(e){await file.delete({ignoreNotFound:true});throw e;}return {ok:true};}
 if(op==='submit'){applicant(a);if(d.declaration!==true)err('invalid-argument','Confirm the declaration.');const r=doc('applications',d.id);const ref=P.reference();return db.runTransaction(async t=>{const x=data(await t.get(r));owned(a,x);if(x.uid!==a.uid)err('permission-denied','Private record.');if(x.submitted&&!['changes_requested'].includes(x.status))return {reference:x.reference,status:x.status};const v=data(await t.get(doc('vacancies',x.position)));if(x.status==='draft'&&!P.open(v)||x.status==='changes_requested'&&now()>x.correctionDeadline)err('failed-precondition','Submission deadline passed.');if(!['draft','changes_requested'].includes(x.status)||!x.qualifications.trim()||!x.experience.trim())err('invalid-argument','Complete qualifications and experience.');const requirements=x.status==='draft'?v.requirements||[]:x.requirements;if(requirements.some(l=>!x.documents.some(f=>f.label===l&&f.scan!=='infected')))err('invalid-argument','Attach every required document.');const at=now(),reference=x.reference||ref,version=x.version+1,status=x.status==='draft'?'submitted':'under_review';if(!x.reference)t.create(doc('references',reference),{application:r.id});const snapshot={...x,requirements,reference,status,submitted:true,version,updated:at};t.create(r.collection('versions').doc(String(version)),snapshot);t.update(r,{requirements,reference,status,submitted:true,version,submittedAt:x.submittedAt||at,updated:at,history:[...x.history,{status,at}]});audit(t,a,'application_submitted',r.id);notify(t,a.uid,'Application received: '+reference,r.id);t.create(col('staffAlerts').doc(),{reference,application:r.id,at,kind:'submission'});return {reference,status};});}
 if(op==='download'){const r=data(await doc('applications',d.id).get());owned(a,r);const f=r.documents.find(x=>x.id===d.fileId);if(!f||f.scan!=='clean')err('failed-precondition','Document is not available until security scanning passes.');const [b]=await bucket().file(f.path).download();await col('audit').add({actor:a.uid,action:'document_download',ref:r.id,at:now()});return {base64:b.toString('base64'),name:f.name,type:f.type};}
 if(op==='transition'){staff(a);const r=doc('applications',d.id);const to=str(d.status,50),reason=str(d.reason,2000);await db.runTransaction(async t=>{const x=data(await t.get(r));if(!P.canMove(a,x.status,to))err('failed-precondition','Transition not permitted.');if(to==='vetted'&&x.attendance!=='present')err('failed-precondition','Record present attendance before marking vetted.');if(to==='approved_for_vetting'&&x.requirements.some(l=>!x.documents.some(f=>f.label===l&&f.scan==='clean')))err('failed-precondition','All required documents must pass security scanning.');let extra={};if(to==='changes_requested'){const deadline=Number(d.correctionDeadline);if(!Number.isFinite(deadline)||deadline<=now())err('invalid-argument','Enter a future correction deadline.');extra={correctionDeadline:deadline};}const at=now();t.update(r,{...extra,status:to,updated:at,history:[...x.history,{status:to,at,reason}]});audit(t,a,'status_'+to,r.id);notify(t,x.uid,'Application update: '+to.replaceAll('_',' '),r.id);});return {ok:true};}
 if(op==='withdraw'){applicant(a);const r=doc('applications',d.id);await db.runTransaction(async t=>{const x=data(await t.get(r));owned(a,x);if(!['draft','submitted','under_review','changes_requested','approved_for_vetting','vetting_scheduled'].includes(x.status))err('failed-precondition','Cannot withdraw this record.');if(x.session)err('failed-precondition','Contact staff to cancel scheduled vetting before withdrawing.');t.update(r,{status:'withdrawn',updated:now(),history:[...x.history,{status:'withdrawn',at:now()}]});audit(t,a,'withdrawn',r.id);});return {ok:true};}
 if(op==='sessionCreate'){staff(a);const title=str(d.title,120),venue=str(d.venue,200);const start=Number(d.start),end=Number(d.end),capacity=Number(d.capacity);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=now()||end<=start||end-start>86400000||!Number.isInteger(capacity)||capacity<1||capacity>100)err('invalid-argument','Check date, time and capacity.');const panel=(Array.isArray(d.panel)?d.panel:[]).map(id);if(panel.length>12||new Set(panel).size!==panel.length)err('invalid-argument','Invalid panel list.');const r=col('sessions').doc();await db.runTransaction(async t=>{const gate=doc('locks','schedule');await t.get(gate);for(const uid of panel){const u=data(await t.get(doc('profiles',uid)));if(u.role!=='panel'||u.active===false)err('invalid-argument','Panel account unavailable.');}const overlapping=await t.get(col('sessions').where('start','<',end));if(overlapping.docs.some(s=>s.data().end>start&&s.data().panel.some(p=>panel.includes(p))))err('failed-precondition','Panel scheduling conflict.');t.set(gate,{at:now()});t.create(r,{title,venue,start,end,capacity,panel,applications:[],created:now()});audit(t,a,'session_created',r.id);});return {id:r.id};}
 if(op==='sessions'){if(P.staff(a.role))return list(col('sessions').orderBy('start').limit(100));if(a.role==='panel')return list(col('sessions').where('panel','array-contains',a.uid).limit(100));err('permission-denied','Staff access required.');}
 if(op==='schedule'){staff(a);const r=doc('applications',d.id),s=doc('sessions',d.session);await db.runTransaction(async t=>{const gate=doc('locks','schedule');await t.get(gate);const x=data(await t.get(r)),v=data(await t.get(s));if(!['approved_for_vetting','vetting_scheduled'].includes(x.status)||v.start<=now())err('failed-precondition','Application or session is not eligible.');if(x.session===s.id)return;if(v.applications.length>=v.capacity)err('failed-precondition','Session is full.');let old=null;if(x.session)old=data(await t.get(doc('sessions',x.session)));const overlaps=await t.get(col('applications').where('uid','==',x.uid));if(overlaps.docs.some(z=>z.id!==r.id&&z.data().vetting&&z.data().vetting.start<v.end&&z.data().vetting.end>v.start&&z.data().status==='vetting_scheduled'))err('failed-precondition','Applicant scheduling conflict.');if(old)t.update(doc('sessions',old.id),{applications:old.applications.filter(k=>k!==r.id)});t.set(gate,{at:now()});t.update(s,{applications:[...v.applications,r.id]});t.update(r,{session:s.id,panel:v.panel,vetting:{title:v.title,venue:v.venue,start:v.start,end:v.end},attendance:'pending',status:'vetting_scheduled',updated:now(),history:[...x.history,{status:'vetting_scheduled',at:now()}]});notify(t,x.uid,'Vetting appointment scheduled. Sign in for details.',r.id);audit(t,a,'vetting_scheduled',r.id);});return {ok:true};}
 if(op==='attendance'){staff(a);const r=doc('applications',d.id);if(!['present','absent','excused'].includes(d.value))err('invalid-argument','Invalid attendance.');await db.runTransaction(async t=>{const x=data(await t.get(r));if(x.status!=='vetting_scheduled')err('failed-precondition','Not scheduled.');t.update(r,{attendance:d.value,updated:now()});audit(t,a,'attendance',r.id);});return {ok:true};}
 if(op==='assessment'){if(a.role!=='panel')err('permission-denied','Panel only.');const r=doc('applications',d.id);const score=Number(d.score);const note=str(d.note,2000);if(!Number.isInteger(score)||score<0||score>100)err('invalid-argument','Score must be 0–100.');await db.runTransaction(async t=>{const x=data(await t.get(r));owned(a,x);if(x.status!=='vetting_scheduled'||x.attendance!=='present')err('failed-precondition','Applicant must be present.');const ar=r.collection('assessments').doc(a.uid);const prev=await t.get(ar);if(prev.exists)err('failed-precondition','Assessment already submitted.');t.create(ar,{uid:a.uid,score,note,at:now()});audit(t,a,'assessment_submitted',r.id);});return {ok:true};}
 if(op==='assessments'){staff(a);const r=doc('applications',d.id);owned(a,data(await r.get()));return list(r.collection('assessments').limit(20));}
 if(op==='notifications'){return list(col('notifications').where('uid','==',a.uid).orderBy('at','desc').limit(100));}
 if(op==='notificationRead'){const r=doc('notifications',d.id);await db.runTransaction(async t=>{const x=data(await t.get(r));if(x.uid!==a.uid)err('permission-denied','Private notification.');t.update(r,{read:true});});return {ok:true};}
 if(op==='summary'){staff(a);return {counts:await counts(),alerts:await list(col('staffAlerts').orderBy('at','desc').limit(20)),at:now()};}
 if(op==='dailyReports'){staff(a);return list(col('dailyReports').orderBy('at','desc').limit(30));}
 if(op==='panelList'){staff(a);return (await list(col('profiles').where('role','==','panel').limit(100))).filter(x=>x.active!==false).map(x=>({id:x.id,name:x.name}));}
 err('invalid-argument','Unknown request.');
}

// Unexpected provider errors must not disclose applicant data or infrastructure details.
// Classify the failure and log only an operation, category, and correlation reference.
const knownOps=new Set(['health','readiness','catalogue','me','profile','vacancies','vacancySave','createDraft','applications','application','draftSave','upload','submit','download','transition','withdraw','sessionCreate','sessions','schedule','attendance','assessment','assessments','notifications','notificationRead','summary','dailyReports','panelList']);
exports.portal=onCall(options,async req=>{
 try{return await handlePortal(req);}catch(e){
  if(e instanceof HttpsError)throw e;
  const op=knownOps.has(req.data?.op)?req.data.op:'unknown';
  const ref='ERR-'+crypto.randomBytes(6).toString('hex').toUpperCase();
  const code=String(e?.code??'').toLowerCase();
  const detail=String(e?.message??'');
  let category='backend_error',status='internal',message='The server could not complete this request. Contact the portal administrator with the support reference.';
  if((code==='9'||code==='failed-precondition')&&/index/i.test(detail)){
   category='firestore_index';status='failed-precondition';message='A database index is missing or still building. The administrator must deploy the Firestore indexes and wait for them to become ready.';
  }else if(code==='5'||code==='not-found'||/database .*does not exist|database .*not found/i.test(detail)){
   category='resource_missing';status='failed-precondition';message='A required backend resource is missing. The administrator must check the Firestore database and Storage configuration.';
  }else if(code==='7'||code==='permission-denied'||code==='auth/insufficient-permission'||code==='storage/unauthorized'){
   category='service_permissions';status='failed-precondition';message='The backend service account does not have the required permissions. The administrator must check Google Cloud IAM; do not change public database rules.';
  }else if(code==='14'||code==='unavailable'||code==='4'||code==='deadline-exceeded'){
   category='service_unavailable';status='unavailable';message='A backend service is temporarily unavailable. Please retry shortly.';
  }else if(code==='auth/user-not-found'){
   category='account_missing';status='unauthenticated';message='This account is no longer available. Sign out and sign in again.';
  }
  console.error(JSON.stringify({event:'portal_request_failed',operation:op,category,supportReference:ref}));
  throw new HttpsError(status,message,{supportReference:ref,category});
 }
});

// Daily aggregate snapshots contain no names or documents. Scheduler retries overwrite the same day.
exports.dailySummary=onSchedule({schedule:'0 18 * * *',timeZone:'Africa/Accra',region:'us-central1'},async()=>{const at=now();const day=new Date(at).toISOString().slice(0,10);await col('dailyReports').doc(day).set({at,day,counts:await counts()});});
