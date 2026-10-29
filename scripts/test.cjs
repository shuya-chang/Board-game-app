const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
for(const file of fs.readdirSync(path.join(root,'tests')).filter(file=>file.endsWith('.cjs')).sort()){
 const result=spawnSync(process.execPath,[path.join(root,'tests',file)],{stdio:'inherit',cwd:root});
 if(result.status!==0)process.exit(result.status||1);
}
console.log('All tests and inline script syntax passed.');
