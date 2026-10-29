(function(){
  const removedNotices=new Map();
  function noticeInfo(kind,id){
    if(kind==='borrow'){const request=borrowRequests.find(item=>String(item.id)===id),game=games.find(item=>item.id===request?.collectionId);if(!request||!game)return null;return {title:(game.name||game.en)+' · '+(request.incoming?request.sender+' 的借用請求':'向 '+ownerName(game)+' 借用'),status:{pending:'等待回覆',handoff:'借出中',received:'已借出',returning:'歸還中',returned:'已歸還',declined:'已婉拒',cancelled:'已取消',needs_contact:'待補充聯絡方式'}[request.status]||request.status,removable:true};}
    if(kind==='group'){const request=groupJoinRequests.find(item=>String(item.id)===id);if(!request)return null;return {title:request.group+' · '+(request.applicant==='me'?'加入申請':request.nickname+' 申請加入'),status:{pending:'等待核准',accepted:'已核准',declined:'已婉拒',cancelled:'已取消'}[request.status]||request.status,removable:true};}
    const notice=groupAnnouncements.find(item=>String(item.id)===id);if(!notice)return null;const read=notice.readBy.includes('me'),sent=notice.sender==='me';return {title:notice.group+' · '+notice.title,status:sent?'已發送':read?'已讀':'未讀',removable:true};
  }
  const baseUnreadCount=notificationUnreadCount;
  notificationUnreadCount=function(){const hiddenBorrow=borrowRequests.filter(request=>removedNotices.get('borrow:'+request.id)===noticeInfo('borrow',String(request.id))?.status&&((request.incoming&&['pending','returning'].includes(request.status))||(!request.incoming&&request.status==='handoff'))).length;const hiddenAnnouncements=groupAnnouncements.filter(notice=>removedNotices.get('announcement:'+notice.id)===noticeInfo('announcement',String(notice.id))?.status&&notice.recipients.includes('me')&&!notice.readBy.includes('me')).length;return Math.max(0,baseUnreadCount()-hiddenBorrow-hiddenAnnouncements);};
  const baseNotifications=renderNotifications;
  renderNotifications=function(){
    baseNotifications();let visible=0;
    document.querySelectorAll('#content [data-notice-kind]').forEach(card=>{
      const kind=card.dataset.noticeKind,id=card.dataset.noticeId,key=kind+':'+id,info=noticeInfo(kind,id);if(!info)return;
      if(removedNotices.get(key)===info.status){card.remove();return;}removedNotices.delete(key);visible++;
      const oldHeading=card.querySelector('.notice-card-heading')||card.querySelector('h3');if(oldHeading)oldHeading.remove();
      const details=document.createElement('details');details.className='compact-notice';
      const summary=document.createElement('summary'),title=document.createElement('strong'),status=document.createElement('span');title.textContent=info.title;status.textContent=info.status;status.className='compact-notice-status';summary.append(title,status);
      const body=document.createElement('div');body.className='compact-notice-body';while(card.firstChild)body.append(card.firstChild);
      if(info.removable){const remove=document.createElement('button');remove.type='button';remove.className='secondary remove-notice';remove.textContent='移除此通知';remove.onclick=()=>{const current=noticeInfo(kind,id);if(!current)return;if(kind==='borrow'){const request=borrowRequests.find(item=>String(item.id)===id),game=games.find(item=>item.id===request?.collectionId);if(NotificationFlow.dismissBorrow(request,game)&&game)window.syncBorrowingRequest?.(request,game);}else if(kind==='group'){const request=groupJoinRequests.find(item=>String(item.id)===id);if(request?.status==='pending')request.status='cancelled';}removedNotices.set(key,noticeInfo(kind,id)?.status||current.status);updateIdentity();renderNotifications();toast('已移除通知');};body.append(remove);}
      details.append(summary,body);card.replaceChildren(details);card.classList.add('compact-notice-card');
    });
    if(!visible){const empty=document.createElement('p');empty.className='empty';empty.textContent='目前沒有通知。';$('#content').append(empty);}
    document.querySelectorAll('nav button[data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page==='notifications'));
  };
  const baseSettings=renderDisplaySettings;
  renderDisplaySettings=function(){
    baseSettings();const form=$('#displayForm');if(!form)return;
    // Preserve the existing inputs, form submission and option handlers.
    form.querySelectorAll(':scope > fieldset').forEach(fieldset=>{const legend=fieldset.querySelector('legend'),details=document.createElement('details'),summary=document.createElement('summary');details.className='compact-setting';summary.textContent=legend?.textContent||'顯示設定';fieldset.before(details);details.append(summary,fieldset);fieldset.style.margin='0';fieldset.style.padding='0';if(legend)legend.hidden=true;});
    const view=form.querySelector('input[name="view"]')?.closest('.view-options');if(view){const title=view.previousElementSibling,details=document.createElement('details'),summary=document.createElement('summary');details.className='compact-setting';summary.textContent='桌遊顯示方式';view.before(details);details.append(summary,view);if(title?.textContent==='桌遊顯示方式')title.remove();}
    const size=$('#cardSizeSettings'),sizePanel=size?.parentElement;const syncSize=()=>{if(sizePanel?.classList.contains('compact-setting'))sizePanel.hidden=form.elements.view.value!=='grid';};form.querySelectorAll('input[name="view"]').forEach(input=>input.addEventListener('change',syncSize));syncSize();
  };
  if(page==='notifications')renderNotifications();if(page==='settings')renderDisplaySettings();
})();
