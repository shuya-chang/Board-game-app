function publicKey(){
 const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
 if(key.startsWith('sb_publishable_'))return key;
 try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon')return key;}catch{}
 return '';
}
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: publicKey(),
    bggEnabled: false
  })
});
