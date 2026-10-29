const {createClient}=require('@supabase/supabase-js');
(async()=>{
  const panel=document.createElement('div');panel.className='section';panel.id='cloudAccount';
  const status=document.createElement('p');status.setAttribute('role','status');
  const login=document.createElement('button');login.type='button';login.className='secondary';login.textContent='使用 Google 登入';
  const logout=document.createElement('button');logout.type='button';logout.className='secondary';logout.textContent='登出雲端帳號';logout.hidden=true;
  const storageNotice=document.createElement('p');storageNotice.className='footnote';storageNotice.textContent='目前為功能預覽：收藏與租借資料尚未跨裝置同步，重新整理會還原。';
  panel.append(status,login,logout,storageNotice);
  // Account controls stay independent from the in-memory preview identity until
  // the domain adapter is migrated. Never upload another person's preview data.
  document.querySelector('main .top').after(panel);
  try{
    const state=await globalThis.BoardGameCloud.initialize(createClient);
    if(!state.configured){status.textContent='雲端服務尚未連結';login.disabled=true;return;}
    const session=await globalThis.BoardGameCloud.session();
    status.textContent=session?'雲端帳號已登入；收藏與租借目前仍是本機預覽資料。':'請登入雲端帳號';login.hidden=!!session;logout.hidden=!session;
    login.onclick=async()=>{login.disabled=true;try{await globalThis.BoardGameCloud.signIn();}catch{status.textContent='無法登入，請稍後再試。';login.disabled=false;}};
    logout.onclick=async()=>{logout.disabled=true;try{await globalThis.BoardGameCloud.signOut();location.reload();}catch{status.textContent='登出失敗，請重試。';logout.disabled=false;}};
  }catch{status.textContent='雲端連線尚未就緒';login.disabled=true;}
})();
