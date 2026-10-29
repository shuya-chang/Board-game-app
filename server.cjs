const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.css':'text/css; charset=utf-8'};
function handler(req,res){
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  if(pathname==='/api/public-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({supabaseUrl:'',supabasePublishableKey:'',bggEnabled:false}));}
  if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({message:'本機尚未連結雲端服務'}));}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const allowed=pathname==='/'||pathname==='/index.html'||(pathname.startsWith('/assets/')&&file.startsWith(path.join(root,'assets')+path.sep)&&Object.hasOwn(types,path.extname(file)));
  if(!allowed||!file.startsWith(root+path.sep)){res.writeHead(404);return res.end('Not found');}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(data);});
}
if(require.main===module)http.createServer(handler).listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));
module.exports={handler};
