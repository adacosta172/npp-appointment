// Requires the project operator's authenticated Firebase CLI session.
// Never uses the public web API key as an administrative credential.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
function run(cmd,args){
 console.log('\n> '+cmd+' '+args.join(' '));
 // Use shell only for fixed, trusted commands on Windows (.cmd executables).
 const r=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});
 if(r.error)throw r.error;
 if(r.status!==0)throw Error('Stopped: '+cmd+' failed. Resolve the error above before continuing.');
}
try{
 if(!process.argv.includes('--confirm-dedicated-project'))throw Error('Review existing Firebase rules. Run npm run deploy:online -- --confirm-dedicated-project only if nppappointment is dedicated to this portal.');
 run('npm',['test']);
 run('npm',['install']);
 run('npm',['--prefix','functions','install']);
 run('npm',['run','build']);
 run('npx',['--yes','firebase-tools@14','deploy','--only','functions:portal,functions:dailySummary,firestore,storage,hosting','--project','nppappointment']);
 run('node',['scripts/check-live.mjs']);
 console.log('\nBackend and frontend public checks passed. Sign in with the designated verified staff account, finish MFA, publish the positions, and perform private acceptance tests.');
}catch(e){console.error(e.message);process.exitCode=1;}
