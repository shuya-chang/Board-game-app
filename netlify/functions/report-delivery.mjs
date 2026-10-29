// Scheduled-only Netlify function; not an HTTP trigger in production.
export default async function(){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,hook=process.env.DISCORD_REPORT_WEBHOOK_URL;
 if(!base||!key||!hook)return;
 const webhook=new URL(hook);
 if(webhook.protocol!=='https:'||!['discord.com','discordapp.com'].includes(webhook.hostname)||!webhook.pathname.startsWith('/api/webhooks/'))throw new Error('Invalid Discord webhook configuration');
 webhook.searchParams.set('wait','true');
 const rpc=async(name,body)=>{
   const response=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new Error('Report delivery database request failed');return response.json();
 };
 const reports=await rpc('claim_report_delivery',{});
 await Promise.all(reports.map(async report=>{
   let success=false;
   try{
     const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowed_mentions:{parse:[]},content:'桌遊網站收到新回報\n分類：'+report.category+'\n標題：'+report.title+'\n編號：'+report.report_id+'\n請至私人後台查看內容。'}),signal:AbortSignal.timeout(8000)});
     success=response.ok;
   }catch{}
   await rpc('finish_report_delivery',{target_report:report.report_id,lease_token:report.lease,success});
 }));
}
