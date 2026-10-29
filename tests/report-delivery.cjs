const assert=require('node:assert/strict');
(async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';
 process.env.DISCORD_REPORT_WEBHOOK_URL='https://discord.com/api/webhooks/123/test-token';
 const oldFetch=global.fetch,calls=[];
 global.fetch=async(url,options)=>{
  calls.push({url:String(url),body:JSON.parse(options.body)});
  if(String(url).endsWith('/claim_report_delivery'))return {ok:true,json:async()=>[{report_id:'report',title:'@everyone title',category:'data',lease:'lease'}]};
  if(String(url).includes('discord.com'))return {ok:false,status:429};
  return {ok:true,json:async()=>null};
 };
 try{
  await (await import('../netlify/functions/report-delivery.mjs')).default();
  assert.equal(calls.length,3);
  assert.deepEqual(calls[1].body.allowed_mentions,{parse:[]});
  assert(calls[1].url.endsWith('?wait=true'));
  assert.equal(calls[2].body.success,false);
  assert(!JSON.stringify(calls[1].body).includes('test-service'));
 }finally{global.fetch=oldFetch;}
 console.log('5 Discord queue retry and mention-suppression checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
