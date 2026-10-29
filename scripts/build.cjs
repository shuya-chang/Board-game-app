const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
// Deliberate allowlist: backend sources, credentials and QA fixtures are never published.
for (const file of ['index.html']) fs.copyFileSync(path.join(root, file), path.join(output, file));
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
require('esbuild').buildSync({entryPoints:[path.join(root,'features/cloud-auth-entry.js')],bundle:true,platform:'browser',format:'iife',target:'es2022',outfile:path.join(output,'assets/cloud-auth.js'),minify:true});
let html=fs.readFileSync(path.join(output,'index.html'),'utf8');
html=html.replace('</html>','<script src="/assets/cloud-auth.js" defer></script></html>');
fs.writeFileSync(path.join(output,'index.html'),html);
console.log('Built public assets in dist/');
