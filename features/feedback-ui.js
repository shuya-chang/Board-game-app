(function(){
  const dialog=document.createElement('dialog');dialog.id='feedbackDialog';
  dialog.innerHTML='<form id="feedbackForm"><h2>回報問題</h2><label>分類<select name="category"><option value="data">資料問題</option><option value="program">程式問題</option><option value="other">其他</option></select></label><label>標題<input name="title" required maxlength="120"></label><label>問題內容<textarea name="body" required maxlength="5000" rows="5" placeholder="哪個欄位或操作有問題？預期應該是什麼？請勿填寫密碼、電話或借用金額等私人資料。"></textarea></label><p role="status" id="feedbackStatus"></p><div class="actions"><button type="button" class="secondary" id="cancelFeedback">取消</button><button class="primary" type="submit">提交回報</button></div></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]');
  let submitting=false,relatedGame=null;
  function open(game){form.reset();relatedGame=game||null;form.elements.category.value=game?'data':'program';status.textContent='';form.querySelector('[type=submit]').hidden=false;dialog.showModal();}
  dialog.querySelector('#cancelFeedback').onclick=()=>{if(!submitting)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
  form.onsubmit=async event=>{
    event.preventDefault();if(submitting)return;
    const session=await globalThis.BoardGameCloud?.session().catch(()=>null);
    if(!session){status.textContent='尚未送出：請先完成雲端連結並登入帳號。';return;}
    submitting=true;form.querySelector('[type=submit]').disabled=true;status.textContent='提交中…';
    try{
      const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({category:form.elements.category.value,title:form.elements.title.value.trim(),gameId:relatedGame?.cloudGameId||null,body:(relatedGame?'相關桌遊：'+(relatedGame.name||relatedGame.en)+'\n':'')+form.elements.body.value.trim()})});
      const result=await response.json();if(!response.ok)throw new Error(result.message||'提交失敗');
      status.textContent='已提交，回報編號：'+result.id;form.querySelector('[type=submit]').hidden=true;
    }catch(error){status.textContent='尚未送出：'+error.message;}
    finally{submitting=false;form.querySelector('[type=submit]').disabled=false;}
  };
  const footer=document.querySelector('main > .footnote');
  const general=document.createElement('button');general.type='button';general.className='secondary';general.textContent='回報問題';general.onclick=()=>open(null);footer?.append(document.createTextNode(' '),general);
  const navigation=document.querySelector('#mainSidebar nav');
  const report=document.createElement('button');report.type='button';report.id='openFeedback';report.className='nav-utility';report.setAttribute('aria-label','回報問題');report.innerHTML='<span class="nav-icon" aria-hidden="true">!</span><span class="nav-tooltip" role="tooltip">回報問題</span>';report.onclick=()=>open(null);navigation?.append(report);
  const previousDetails=details;
  details=function(id){previousDetails(id);const target=document.querySelector('#detail'),game=games.find(item=>item.id===id);if(!target||!game||!canViewCollection(game))return;let button=target.querySelector('#reportGameProblem');if(!button){button=document.createElement('button');button.id='reportGameProblem';button.type='button';button.className='secondary';button.textContent='回報資料問題';target.append(button);}button.onclick=()=>open(game);};
})();
