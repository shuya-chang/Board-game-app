(function(){
  let user=null,ready=false,nextId=1000,ownProfile=null,accountPanel=null,cloudPeople=[],cloudMemberships=[];
  const ids=new Map();
  const noteDrafts=new Map();
  const idFor=key=>{if(!ids.has(key))ids.set(key,nextId++);return ids.get(key);};
  function placeAccountPanel(){if(!accountPanel)return;accountPanel.hidden=page!=='profile';if(page==='profile')$('#content').append(accountPanel);else document.body.append(accountPanel);}
  function requireReady(){if(!user)throw new Error('請先到個人資料使用 Google 登入');if(!ready)throw new Error('雲端資料尚未載入完成，請稍後重試');}
  async function refresh(){
    // All requests must succeed before replacing the visible snapshot. A failed
    // read must never masquerade as an empty collection or delete local drafts.
    const [rows,terms,notes,loans,custody,people,groups,memberships,archived]=await Promise.all([BoardGameCloud.collections(),BoardGameCloud.ownTerms(),BoardGameCloud.privateNotes(),BoardGameCloud.loans(),BoardGameCloud.custody(),BoardGameCloud.people(),BoardGameCloud.groups(),BoardGameCloud.memberships(),BoardGameCloud.dismissals()]);
    const loaded=CloudCollectionModel.hydrate(rows,terms,user.id,idFor);
    if(window.loadCloudExtras)await window.loadCloudExtras({user,groups,memberships,people});
    const alias=id=>id===user.id?'me':id;
    const name=id=>people.find(p=>p.id===id)?.nickname||'團外使用者';
    for(const g of loaded){const state=custody.find(c=>c.collection_id===g.cloudId);if(state&&state.stage!=='available'){g.loanStage=state.stage;g.borrowerId=alias(state.holder_id);g.loan=name(state.holder_id);}}
    const requests=loans.filter(l=>l.borrower_id).map(l=>({id:idFor('loan:'+l.id),cloudId:l.id,collectionId:idFor(l.collection_id),sender:l.owner_id===user.id?name(l.borrower_id):profile.nickname,memberId:alias(l.borrower_id),borrowerId:alias(l.borrower_id),incoming:l.owner_id===user.id,status:l.status,contact:l.borrower_contact,ownerContact:l.owner_contact,loanNote:l.note,expectedReturnDate:l.expected_return_date,expectedReturnSource:l.due_source,deposit:l.deposit,rentalFee:l.fee,receivedAt:l.received_at,returnedAt:l.returned_at,createdAt:l.created_at,cloudDismissed:archived.some(d=>d.loan_id===l.id&&d.revision===l.revision)}));
    for(const l of loans.filter(l=>!l.borrower_id&&['received','returning'].includes(l.status))){const g=loaded.find(c=>c.cloudId===l.collection_id);if(g){g.loan=l.external_name;g.loanStage=l.status==='returning'?'returning':'loaned';g.manualLoan={id:l.id,kind:'external',borrower:l.external_name,phone:l.borrower_phone,mobile:l.borrower_mobile,note:l.note,startedAt:l.received_at,expectedReturnDate:l.expected_return_date,expectedReturnSource:l.due_source,deposit:l.deposit,rentalFee:l.fee};}}
    cloudPeople=people;cloudMemberships=memberships;
    groupNames=groups.map(g=>g.name);myGroups=groups.filter(g=>memberships.some(m=>m.group_id===g.id&&m.user_id===user.id)).map(g=>g.name);
    for(const map of [previewMemberships,groupOwners,groupDescriptions,groupTags,groupJoinPolicies,groupAdmins])for(const key of Object.keys(map))delete map[key];
    for(const g of groups){groupOwners[g.name]=alias(g.owner_id);groupDescriptions[g.name]=g.description||'';groupTags[g.name]=g.tags||[];groupJoinPolicies[g.name]=g.is_public?'open':'approval';groupAdmins[g.name]=memberships.filter(m=>m.group_id===g.id&&m.role==='admin').map(m=>alias(m.user_id));for(const m of memberships.filter(m=>m.group_id===g.id&&m.user_id!==user.id)){const key=alias(m.user_id);(previewMemberships[key]||=[]).push(g.name);}}
    borrowRequests=requests;
    games=loaded;
    window.replaceBorrowingLedger(loans.filter(l=>l.received_at).map(l=>{const s=l.snapshot||{},incoming=l.owner_id===user.id;return {key:l.id,gameId:idFor(l.collection_id),gameName:s.game?.name||s.game?.english_name||'桌遊',gameEnglish:s.game?.english_name||'',ownerId:alias(l.owner_id),ownerName:s.owner||name(l.owner_id),borrowerId:alias(l.borrower_id),borrowerName:s.borrower||l.external_name||name(l.borrower_id),direction:incoming?'lend':'borrow',partyKey:l.borrower_id?'member:'+(incoming?l.borrower_id:l.owner_id):'external:'+l.external_name,partyName:incoming?(s.borrower||l.external_name||name(l.borrower_id)):(s.owner||name(l.owner_id)),ownerContact:l.owner_contact,borrowerContact:l.borrower_contact,phone:l.borrower_phone,mobile:l.borrower_mobile,note:l.note,startedAt:l.received_at,expectedReturnDate:l.expected_return_date,expectedReturnSource:l.due_source,deposit:l.deposit,rentalFee:l.fee,returnedAt:l.returned_at,state:l.status==='returned'?'returned':l.status==='returning'?'returning':'loaned',external:!l.borrower_id};}));
    window.replaceCollectionPrivateNotes([...notes.map(note=>[note.game_id,note.body]),...noteDrafts]);
    ready=true;render();updateIdentity();
  }
  window.CloudWorkspace={
    get active(){return !!user;},
    get userId(){return user?.id||null;},
    async attachSession(session){user=session?.user||null;ready=false;if(user){ownProfile=await BoardGameCloud.myProfile();profile={nickname:ownProfile.nickname,avatar:ownProfile.avatar_mode==='custom'?await BoardGameCloud.mediaUrl(ownProfile.avatar_path):ownProfile.avatar_mode==='google'?ownProfile.google_avatar:'',contact:ownProfile.contact,scope:ownProfile.preferences.scope||''};scope=profile.scope;await refresh();}},
    attachPanel(panel){accountPanel=panel;placeAccountPanel();},
    async saveCollection(record,copyKey,gameKey,note){
      requireReady();const values=CloudCollectionModel.payload(record,note);
      let saved;
      try{saved=await BoardGameCloud.saveMyCollection(copyKey,gameKey,values.common,values.personal);}
      catch(error){throw new Error(error.code==='PGRST202'?'雲端資料庫需要更新；輸入內容已保留，請先完成資料庫更新。':'雲端儲存失敗，輸入內容已保留，請重試。');}
      // The server already acknowledged the write. If a follow-up read fails,
      // preserve the acknowledged record and its stable identity for retry.
      record.cloudId=saved.collection_id;record.cloudGameId=saved.game_id;record.gameKey=saved.game_id;record.id=idFor(saved.collection_id);
      try{await refresh();}catch{const index=games.findIndex(g=>g.cloudId===saved.collection_id);if(index<0)games.push(record);else games[index]=record;noteDrafts.set(saved.game_id,note);render();toast('已儲存到雲端；列表更新暫時失敗，稍後可重新載入確認。');}
    },
    async saveNote(gameId,body){requireReady();noteDrafts.set(gameId,body);await BoardGameCloud.savePrivateNote(gameId,body);if(noteDrafts.get(gameId)===body)noteDrafts.delete(gameId);},
    async changeLoan(request,command,contact=''){requireReady();await BoardGameCloud.actOnLoan(request.cloudId,command,contact);await refresh();},
    async dismissNotice(request){await this.changeLoan(request,'dismiss');toast('已移除通知');},
    async lend(game,member,data,ownerContact,due){requireReady();const pending=borrowRequests.find(r=>r.collectionId===game.id&&r.incoming&&r.status==='pending'&&r.memberId===member?.id);if(pending)await BoardGameCloud.actOnLoan(pending.cloudId,'accept',ownerContact);else await BoardGameCloud.lendCopy(game.cloudId,member?.id||null,data,ownerContact,due);await refresh();},
    async returnExternal(game){requireReady();await BoardGameCloud.actOnLoan(game.manualLoan.id,'confirm_return');await refresh();},
    canSetImages(game){return !!user&&game.imageOwner===user.id&&game.imageSource==='not_found'&&!(game.mediaPaths||[]).length;},
    async saveImages(game,files){requireReady();if(!this.canSetImages(game)||files.length<1||files.length>3)throw new Error('只有首位建立者可在 BGG 查無資料時設定最多 3 張圖片');for(const file of files)if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('請選擇 2 MB 以下的 PNG、JPEG 或 WebP 圖片');const paths=[];for(const file of files){const path=user.id+'/catalog/'+game.cloudGameId+'/'+crypto.randomUUID();await BoardGameCloud.uploadMedia(path,file);paths.push(path);}await BoardGameCloud.saveMedia(game.cloudGameId,paths);await refresh();},
    refresh
  };
  const previousReply=handleBorrowReply;
  handleBorrowReply=async function(id,action){if(!user)return previousReply(id,action);const request=borrowRequests.find(r=>r.id===id);if(!request)return;
    try{let contact='';if(action==='accepted'){contact=await requestLenderContact(request);if(contact===null)return;}
      if(action==='returned'&&!await showAppConfirmation({kicker:'歸還確認',title:'確認已收回桌遊？',message:'確認已實際收回後，才會結束這次借用。',confirmLabel:'是，已收回'}))return;
      const commands={accepted:'accept',received:'receive',returning:'return',returned:'confirm_return',needs_contact:'needs_contact',declined:'decline',cancelled:'dismiss'};
      if(!commands[action])return;await CloudWorkspace.changeLoan(request,commands[action],contact);toast('已更新借用狀態');
    }catch{toast('無法更新，請重新載入確認目前狀態後再試');}
  };
  $('#borrowForm').onsubmit=async event=>{event.preventDefault();const form=event.target,game=games.find(g=>g.id===+$('#borrowOwner').value),submit=$('#submitBorrowRequest');if(submit.disabled)return;
    try{requireReady();if(!game||game.owner==='me'||borrowRequestBlocked(game))throw new Error('請重新選擇可借用的對象');if(!validContact(form.elements.contact.value))throw new Error('請填寫聯絡方式');submit.disabled=true;
      await BoardGameCloud.requestLoan(game.cloudId,form.elements.contact.value.trim(),window.readLoanDueDate(form.elements.expectedReturnDate),form.elements.loanNote.value.trim());await refresh();$('#borrowDialog').close();$('#detail').close();toast('已送出借用請求');
    }catch(error){toast(error.message||'送出失敗，請重新確認狀態');}finally{submit.disabled=false;}
  };
  const removeButton=$('#editorRemoveCollection');removeButton.onclick=async()=>{try{requireReady();const game=games.find(g=>g.id===editing);if(!game||game.owner!=='me')return;if(collectionRemovalBlocked(game))throw new Error('借用尚未結束，無法移除收藏');if(!await showAppConfirmation({kicker:'收藏管理',title:'移除我的收藏？',message:'只會移除自己的收藏，借用歷史會保留。',confirmLabel:'確認移除',danger:true}))return;await BoardGameCloud.saveCollection(game.cloudId,{status:CloudCollectionModel.payload(game,'').personal.status,recommendation:game.ownerRecommendation,actualMinutes:game.actualTime,actualBasis:game.actualTimeBasis==='per-person'?'person':'whole',archive:true});await refresh();$('#editor').close();editing=null;toast('已移除自己的收藏');}catch(error){toast(error.message||'移除失敗，請重試');}};
  function bindProfile(){
    const form=$('#profileForm');if(!form)return;
    const input=$('#photoUpload'),old=$('#photoPreview'),button=document.createElement('button');button.type='button';button.id=old.id;button.className=old.className;button.innerHTML=old.innerHTML;button.setAttribute('aria-label','更換頭像');old.replaceWith(button);button.onclick=()=>input.click();input.hidden=true;input.closest('label').hidden=true;
    let file=null,removed=false;
    input.addEventListener('change',()=>{file=input.files[0]||null;removed=false;});
    $('#resetPhoto').addEventListener('click',()=>{file=null;removed=true;input.value='';});
    form.onsubmit=async event=>{event.preventDefault();const submit=form.querySelector('button.primary');if(submit.disabled)return;submit.disabled=true;
      try{requireReady();let avatarMode=removed?'none':ownProfile.avatar_mode,avatarPath=ownProfile.avatar_path||'';
        if(file){avatarPath=user.id+'/avatars/'+crypto.randomUUID();await BoardGameCloud.uploadMedia(avatarPath,file);avatarMode='custom';}
        const values={nickname:$('#nickname').value.trim(),contact:$('#defaultContact').value.trim(),avatarMode,avatarPath,preferences:{...ownProfile.preferences,scope:$('#defaultScope').value}};
        await BoardGameCloud.saveProfile(values);ownProfile={...ownProfile,nickname:values.nickname,contact:values.contact,avatar_mode:avatarMode,avatar_path:avatarPath,preferences:values.preferences};
        profile={nickname:values.nickname,contact:values.contact,scope:values.preferences.scope,avatar:avatarMode==='none'?'':avatarMode==='custom'?await BoardGameCloud.mediaUrl(avatarPath):ownProfile.google_avatar};scope=profile.scope;updateIdentity();toast('個人資料已儲存到雲端');
      }catch(error){toast(error.message||'儲存失敗，請重試');}finally{submit.disabled=false;}
    };
  }
  const previousRender=render;
  render=function(){previousRender();placeAccountPanel();if(page==='profile')bindProfile();};
  const previousMembers=groupMemberList;
  groupMemberList=function(name){const members=previousMembers(name);return members.map(m=>{const person=cloudPeople.find(p=>p.id===m.id);return person?{...m,name:person.nickname,avatar:person.google_avatar||''}:m;});};
  const previousNotifications=renderNotifications;
  renderNotifications=function(){previousNotifications();document.querySelectorAll('[data-fix-contact]').forEach(button=>button.onclick=async()=>{const request=borrowRequests.find(r=>r.id===+button.dataset.fixContact);if(!request)return;const contact=prompt('請補充清楚的聯絡方式',request.contact||'');if(contact===null)return;if(!validContact(contact)){toast('請填寫聯絡方式');return;}button.disabled=true;try{await CloudWorkspace.changeLoan(request,'update_contact',contact.trim());}catch{toast('送出未完成，請重試');button.disabled=false;}});};
  const previousUnread=notificationUnreadCount;
  notificationUnreadCount=function(){const hidden=borrowRequests.filter(r=>r.cloudDismissed&&((r.incoming&&['pending','returning'].includes(r.status))||(!r.incoming&&r.status==='handoff'))).length;return Math.max(0,previousUnread()-hidden);};
  const previousEdit=edit;
  edit=function(game){try{requireReady();return previousEdit(game);}catch(error){toast(error.message);}};
  // Remove shipped demonstration data before any cloud read. Never upload it.
  games=[];borrowRequests=[];loanHistory=[];myGroups=[];groupNames=[];schedules={};recurringRules.length=0;groupAnnouncements.length=0;groupJoinRequests.length=0;
  for(const key of Object.keys(previewMemberships))delete previewMemberships[key];
  window.replaceBorrowingLedger([]);window.replaceCollectionPrivateNotes([]);
  profile={nickname:'尚未登入',avatar:'',contact:'',scope:''};render();updateIdentity();
  const style=document.createElement('style');style.textContent='.settings-form{width:100%;max-width:720px!important;margin-inline:auto!important;box-sizing:border-box}.profile-photo{cursor:pointer;padding:0;flex-shrink:0}.profile-form label[hidden]{display:none!important}#cloudAccount{max-width:720px;margin:24px auto 0}#cloudAccount[hidden]{display:none!important}@media(max-width:650px){.settings-form{min-width:0!important;width:100%!important}.theme-options{grid-template-columns:1fr}}';document.head.append(style);
})();
