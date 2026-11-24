const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function startup(protocol='https:'){
 const elements=new Map();
 const element=()=>({addEventListener(k,fn){this[k]=fn;}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 let handler,timeout;
 const window={addEventListener(type,callback){handler=callback;}};
 vm.runInNewContext(source,{window,document:{getElementById:get},location:{protocol,reload(){}},setTimeout(fn,ms){assert.equal(ms,45000);timeout=fn;return 1;},clearTimeout(){}});
 return {get,window,fireError:()=>handler({target:{id:'portal-entry'}}),fireTimeout:()=>timeout()};
}
test('direct file does not offer a fake Firebase account or offline submission',()=>{const f=startup('file:');assert.match(f.get('startup-detail').textContent,/deployed HTTPS/);assert.equal(f.window.portalStartup.pending(),false);assert.equal(f.window.portalStartup.complete(),false);});
test('missing entry script leaves usable error and reload control',()=>{const f=startup();f.fireError();assert.match(f.get('startup-detail').textContent,/JavaScript could not be loaded/);assert.equal(typeof f.get('retry-connection').click,'function');});
test('startup timeout fails closed',()=>{const f=startup();f.fireTimeout();assert.match(f.get('startup-detail').textContent,/45 seconds/);assert.equal(f.window.portalStartup.complete(),false);});
test('completed startup ignores watchdog',()=>{const f=startup();assert.equal(f.window.portalStartup.complete(),true);f.fireTimeout();assert.equal(f.get('startup-detail').textContent,undefined);});
test('online frontend contains no embedded offline demo',()=>{assert.doesNotMatch(html,/offline-payload|open-offline|iframe\.srcdoc/);});
