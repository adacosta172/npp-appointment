const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/firebase-config.js');
test('supplied Firebase Web App is the default',async()=>{
  const {resolveFirebaseConfig}=await load();
  const c=resolveFirebaseConfig();
  assert.equal(c.projectId,'nppappointment');
  assert.equal(c.databaseURL,'https://nppappointment-default-rtdb.firebaseio.com');
  assert.equal(c.appId,'1:360671629660:web:73f00b87c8db66b94af199');
  assert.equal(c.authDomain,'nppappointment.firebaseapp.com');
  assert.equal(c.storageBucket,'nppappointment.firebasestorage.app');
  assert.equal(c.messagingSenderId,'360671629660');
  assert.match(c.apiKey,/^AIza/);
});
test('empty environment values do not disable configured project',async()=>{
  const {resolveFirebaseConfig}=await load();
  assert.equal(resolveFirebaseConfig({VITE_FIREBASE_APP_ID:' '}).appId,'1:360671629660:web:73f00b87c8db66b94af199');
});
test('optional environment overrides are respected',async()=>{
  const {resolveFirebaseConfig}=await load();
  assert.equal(resolveFirebaseConfig({VITE_FIREBASE_API_KEY:'test-key'}).apiKey,'test-key');
});
test('emulator defaults do not use production identifiers',async()=>{
  const {resolveFirebaseConfig,firebaseWebConfig}=await load();
  const c=resolveFirebaseConfig({VITE_EMULATOR:'true'});
  assert.equal(c.projectId,'demo-nppappointment');
  for(const key of Object.keys(c)) assert.notEqual(c[key],firebaseWebConfig[key]);
  assert.equal(c.measurementId,undefined);
});

test('Realtime Database URL override is respected',async()=>{
 const {resolveFirebaseConfig}=await load();
 assert.equal(resolveFirebaseConfig({VITE_FIREBASE_DATABASE_URL:'https://example.firebaseio.com'}).databaseURL,'https://example.firebaseio.com');
});
