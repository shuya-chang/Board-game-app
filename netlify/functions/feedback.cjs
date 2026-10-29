const json=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
exports.handler=async event=>{
  if(event.httpMethod!=='POST')return json(405,{message:'僅接受提交回報'});
  const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)return json(503,{message:'問題回報尚未開通'});
  const token=event.headers?.authorization||event.headers?.Authorization;
  if(!/^Bearer \S+$/.test(token||''))return json(401,{message:'請先登入'});
  if(event.isBase64Encoded||Buffer.byteLength(event.body||'','utf8')>24000)return json(413,{message:'回報內容過長'});
  let input;try{input=JSON.parse(event.body||'');}catch{return json(400,{message:'回報格式錯誤'});}
  if(!input||!['data','program','other'].includes(input.category)||typeof input.title!=='string'||!input.title.trim()||input.title.length>120||typeof input.body!=='string'||!input.body.trim()||input.body.length>5000)return json(400,{message:'請填寫分類、標題與問題內容'});
  const headers={apikey:key,Authorization:token};
  try{
    const auth=await fetch(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});
    if(!auth.ok)return json(401,{message:'登入已失效，請重新登入'});
    const user=await auth.json();if(!user.id)return json(401,{message:'請先登入'});
    // Atomic rate check + insert in PostgreSQL; client cannot forge reporter/status.
    const saved=await fetch(base+'/rest/v1/rpc/submit_feedback',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({reporter:user.id,report_category:input.category,report_title:input.title.trim(),report_body:input.body.trim()}),signal:AbortSignal.timeout(8000)});
    if(!saved.ok)return json(saved.status===429?429:503,{message:'暫時無法提交，請稍後再試'});
    const report=await saved.json();
    // A transactional outbox retries Discord independently from submission.
    return json(201,{id:report,notificationQueued:true,message:'已收到問題回報'});
  }catch{return json(503,{message:'暫時無法提交，請稍後再試'});}
};
