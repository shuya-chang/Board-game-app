const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
function loadLocalConfig(){
  try{const values=require('node:util').parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])if(Object.hasOwn(values,key))process.env[key]=values[key];}catch(error){if(error.code!=='ENOENT')throw error;}
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.css':'text/css; charset=utf-8'};
function handler(req,res){
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  if(pathname==='/api/public-config'){loadLocalConfig();require('./netlify/functions/public-config.cjs').handler().then(result=>{res.writeHead(result.statusCode,result.headers);res.end(result.body);}).catch(()=>{res.writeHead(503);res.end();});return;}
  if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({message:'本機尚未連結雲端服務'}));}
  const cloudBundle=pathname==='/assets/cloud-auth.js';
  const file=cloudBundle?path.join(root,'dist/assets/cloud-auth.js'):path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const allowed=cloudBundle||pathname==='/'||pathname==='/index.html'||(pathname.startsWith('/assets/')&&file.startsWith(path.join(root,'assets')+path.sep)&&Object.hasOwn(types,path.extname(file)));
  if(!allowed||!file.startsWith(root+path.sep)){res.writeHead(404);return res.end('Not found');}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');if(file===path.join(root,'index.html')&&fs.existsSync(path.join(root,'dist/assets/cloud-auth.js')))data=data.toString().replace('</html>','<script src="/assets/cloud-auth.js" defer></script></html>');res.end(data);});
}
if(require.main===module)http.createServer(handler).listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));
module.exports={handler};
