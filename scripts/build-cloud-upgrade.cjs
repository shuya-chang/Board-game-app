const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(file=>/^20261030000[89]_|^202610300010_/.test(file)).sort();
const body=files.map(file=>'-- '+file+'\n'+fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/^begin;\s*/i,'').replace(/\s*commit;\s*$/i,'')).join('\n\n');
fs.writeFileSync(path.join(root,'supabase/upgrade-20261030.sql'),`-- Board Game Tool: incremental cloud collection/profile update.
-- Run once in the existing project. No existing collection or loan is deleted.
begin;
${body}
commit;
`);
console.log('Cloud upgrade prepared from '+files.length+' migrations.');
