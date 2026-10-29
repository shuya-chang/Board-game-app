const assert=require('node:assert/strict'),{handler}=require('../server.cjs');
const request=url=>new Promise(resolve=>{let status=200,headers={};handler({url},{writeHead(code,values){status=code;Object.assign(headers,values);},setHeader(k,v){headers[k]=v;},end(body){resolve({status,headers,body:String(body||'')});}});});
(async()=>{
 for(const url of ['/.env','/server.cjs','/.git/config','/netlify/functions/feedback.cjs','/assets/..%2fserver.cjs','/assets/%2e%2e%2f.env'])assert.equal((await request(url)).status,404,url);
 assert.equal((await request('/')).status,200);
 assert.equal((await request('/assets/meeple-logo.svg')).headers['Content-Type'],'image/svg+xml');
 assert.equal((await request('/api/feedback')).status,503);
 console.log('9 local server allowlist and MIME checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
