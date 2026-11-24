// Legacy entry point. Use the same bundled build as Vercel and Firebase Hosting.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync('npm',['run','build'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',shell:process.platform==='win32'});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
