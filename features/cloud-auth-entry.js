const {createClient}=require('@supabase/supabase-js');
(async()=>{
  const panel=document.createElement('div');panel.className='section';panel.id='cloudAccount';
  const status=document.createElement('p');status.setAttribute('role','status');
  const login=document.createElement('button');login.type='button';login.className='secondary';login.textContent='使用 Google 登入';
  const logout=document.createElement('button');logout.type='button';logout.className='secondary';logout.textContent='登出雲端帳號';logout.hidden=true;
  const storageNotice=document.createElement('p');storageNotice.className='footnote';storageNotice.textContent='';
  panel.append(status,login,logout,storageNotice);
  globalThis.CloudWorkspace.attachPanel(panel);
  try{
    const state=await globalThis.BoardGameCloud.initialize(createClient);
    if(!state.configured){status.textContent='雲端服務尚未連結';login.disabled=true;return;}
    const session=await globalThis.BoardGameCloud.session();
    status.textContent=session?'正在載入雲端收藏…':'請登入雲端帳號';login.hidden=!!session;logout.hidden=!session;
    login.onclick=async()=>{login.disabled=true;try{await globalThis.BoardGameCloud.signIn();}catch{status.textContent='無法登入，請稍後再試。';login.disabled=false;}};
    logout.onclick=async()=>{logout.disabled=true;try{await globalThis.BoardGameCloud.signOut();location.reload();}catch{status.textContent='登出失敗，請重試。';logout.disabled=false;}};
    if(session){await globalThis.CloudWorkspace.attachSession(session);status.textContent='雲端帳號已登入';storageNotice.textContent='收藏已從雲端載入。';}
  }catch(error){status.textContent=error.code==='PGRST202'?'雲端資料庫待更新，尚未載入收藏。':'雲端資料尚未載入，請檢查連線後重新整理。';login.disabled=true;}
})();
