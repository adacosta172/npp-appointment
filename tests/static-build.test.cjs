const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFile(path.join(root,name),'utf8');
test('all deployment settings use the npm bundled frontend rather than the raw CDN source',async()=>{
 const p=JSON.parse(await read('package.json'));
 const v=JSON.parse(await read('vercel.json'));
 const f=JSON.parse(await read('firebase.json'));
 assert.equal(p.dependencies.firebase,'11.10.0');
 assert.equal(v.installCommand,'npm install');
 assert.equal(v.buildCommand,'npm run build');
 assert.equal(v.outputDirectory,'dist-static');
 assert.equal(f.hosting.public,v.outputDirectory);
 assert.match(p.scripts.build,/vite build && node scripts\/verify-build\.mjs/);
 assert.match(await read('vite.config.js'),/base: '\.\/'/);
 assert.match(await read('index.html'),/<script id="portal-entry" type="module" src="\/src\/bootstrap\.js"><\/script>/);
 assert.doesNotMatch(await read('src/main.js'),/https:\/\/www\.gstatic\.com\/firebasejs\//);
 assert.match(await read('.github/workflows/pages.yml'),/npm install/);
 assert.match(await read('scripts/deploy-online.mjs'),/run\('npm',\['run','build'\]\)/);
});
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'portal-build-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.mkdir(path.join(dir,'.vite'));await fs.mkdir(path.join(dir,'assets'));
 await fs.writeFile(path.join(dir,'index.html'),'<script type="module" src="./assets/entry.js"></script>');
 await fs.writeFile(path.join(dir,'.vite/manifest.json'),JSON.stringify({'index.html':{isEntry:true,file:'assets/entry.js',dynamicImports:['main.js']},'main.js':{file:'assets/main.js',css:['assets/style.css']}}));
 await fs.writeFile(path.join(dir,'assets/entry.js'),"import('./main.js')");
 await fs.writeFile(path.join(dir,'assets/main.js'),'console.log("bundled")');
 await fs.writeFile(path.join(dir,'assets/style.css'),'body{margin:0}');
 return dir;
}
test('build verifier accepts a complete relative asset graph',async t=>{
 const {verifyBuild}=await import('../scripts/verify-build.mjs');assert.equal(await verifyBuild(await fixture(t)),2);
});
test('build verifier detects missing dynamic asset',async t=>{
 const {verifyBuild}=await import('../scripts/verify-build.mjs');const dir=await fixture(t);await fs.unlink(path.join(dir,'assets/main.js'));await assert.rejects(verifyBuild(dir));
});
test('build verifier detects accidental external CDN SDK imports',async t=>{
 const {verifyBuild}=await import('../scripts/verify-build.mjs');const dir=await fixture(t);await fs.writeFile(path.join(dir,'assets/main.js'),"import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'");await assert.rejects(verifyBuild(dir),/SDK must be bundled/);
});
