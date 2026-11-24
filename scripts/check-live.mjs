// Read-only smoke test: no credentials or applicant records are used.
import { strict as assert } from 'node:assert';
const endpoint='https://us-central1-nppappointment.cloudfunctions.net/portal';
const origin=process.argv[2] || (process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : 'https://nppappointment.web.app');
if (!/^https?:\/\/[^/]+$/.test(origin)) throw Error('Pass an origin only, e.g. https://your-site.vercel.app');
async function request(op){
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({data:{op}}),signal:AbortSignal.timeout(45000)});
  let body;
  try {body=JSON.parse(await r.text());}catch {throw Error(`${op}: HTTP ${r.status}; expected callable JSON. Check deployment and Cloud Run invoker IAM.`);}
  return {r,body};
}
try {
 const pre=await fetch(endpoint,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'},signal:AbortSignal.timeout(30000)});
 assert.ok(pre.ok,`CORS preflight HTTP ${pre.status}`);
 assert.ok([origin,'*'].includes(pre.headers.get('access-control-allow-origin')),'CORS origin denied');
 console.log('PASS CORS preflight');
 const health=await request('health');
 assert.ok(health.r.ok,`Health HTTP ${health.r.status}`);
 assert.equal(health.body.result?.release,'7.2.0','Wrong or outdated Cloud Functions release');
 console.log('PASS matching callable v7.2');
 const catalogue=await request('catalogue');
 assert.ok(catalogue.r.ok,`Catalogue HTTP ${catalogue.r.status}: ${catalogue.body.error?.message||'unknown'}`);
 assert.ok(Array.isArray(catalogue.body.result?.positions),'Catalogue response invalid');
 console.log('PASS Firestore public catalogue; published positions:',catalogue.body.result.positions.length);
 if(!catalogue.body.result.positions.length)console.warn('No positions published. Run seed and publish approved requirements in the admin portal.');
 const ready=await request('readiness');
 assert.ok(ready.r.ok,`Storage/Firestore readiness HTTP ${ready.r.status}: ${ready.body.error?.message||'unknown'}`);
 assert.equal(ready.body.result?.storage,true);
 assert.equal(ready.body.result?.firestore,true);
 console.log('PASS Firebase backend can access Firestore and Storage bucket metadata');
 for(const op of ['me','applications','summary']){
  const denied=await request(op);
  assert.equal(denied.body.error?.status,'UNAUTHENTICATED',`${op} must reject unauthenticated requests`);
 }
 console.log('PASS anonymous access denied; private sign-in, storage and vetting still need live acceptance tests.');
} catch(e){console.error('LIVE CHECK FAILED:',e.message); if(e.cause?.code)console.error(e.cause.code);process.exitCode=1;}
