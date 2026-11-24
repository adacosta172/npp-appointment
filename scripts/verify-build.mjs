import {readFile, stat} from 'node:fs/promises';
import {resolve, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Validate the deployable output, not just the original JavaScript source.
export async function verifyBuild(directory) {
  const root = resolve(directory);
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const manifest = JSON.parse(await readFile(resolve(root, '.vite/manifest.json'), 'utf8'));
  assert.ok(!html.includes('/src/bootstrap.js'), 'Raw source entry was not bundled.');
  assert.ok(!html.includes('https://www.gstatic.com/firebasejs/'), 'Unexpected remote SDK entry.');
  const entries = Object.values(manifest).filter(chunk => chunk.isEntry);
  assert.ok(entries.length > 0, 'No application entry in build manifest.');
  const check = async file => {
    assert.equal(typeof file, 'string');
    const path = resolve(root, file);
    const rel = relative(root, path);
    assert.ok(rel && rel !== '..' && !rel.startsWith('..'+sep) && !isAbsolute(rel), 'Asset escapes build directory.');
    assert.ok((await stat(path)).isFile(), `Missing asset: ${file}`);
    return path;
  };
  for (const chunk of Object.values(manifest)) {
    const path = await check(chunk.file);
    for (const file of [...(chunk.css || []), ...(chunk.assets || [])]) await check(file);
    for (const key of [...(chunk.imports || []), ...(chunk.dynamicImports || [])]) assert.ok(manifest[key], `Missing referenced chunk: ${key}`);
    if (path.endsWith('.js')) {
      const code = await readFile(path, 'utf8');
      assert.doesNotMatch(code, /(?:from\s*|import\s*\(\s*|import\s*)['"](?:firebase\/|https:\/\/www\.gstatic\.com\/firebasejs\/)/, 'Firebase SDK must be bundled, not imported from a remote CDN.');
    }
  }
  for (const entry of entries) assert.ok(html.includes('./'+entry.file), 'HTML must point to relative bundled entry: '+entry.file);
  return Object.keys(manifest).length;
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const count = await verifyBuild(fileURLToPath(new URL('../dist-static/', import.meta.url)));
  console.log(`PASS: ${count} manifest chunks checked; relative frontend assets are present and SDK imports are bundled.`);
}
