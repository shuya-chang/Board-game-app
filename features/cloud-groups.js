(function(){
  let ready=false,groups=[],availabilityRows=[],availabilityRevision=0,dirty=false,timer=null,queue=Promise.resolve(),generation=0;
  const requestIds=new Map();let sequence=100000;
  const localId=id=>{if(!requestIds.has(id))requestIds.set(id,sequence++);return requestIds.get(id);};
  const alias=id=>id===CloudWorkspace.userId?'me':id;
  function requireCloud(){if(!CloudWorkspace.active)throw new Error('請先登入');if(!ready)throw new Error('團體與時間表資料庫尚待更新，尚未儲存');}
  window.loadCloudExtras=async snapshot=>{
    const values=await Promise.allSettled(['group_requests','group_notices','group_notice_reads','group_request_dismissals','availability'].map(table=>BoardGameCloud.tableRows(table)));
    const failure=values.find(value=>value.status==='rejected');
    if(failure){ready=false;if(['PGRST205','42P01'].includes(failure.reason?.code))return;throw failure.reason;}
    const [requests,notices,reads,dismissals,available]=values.map(value=>value.value);
    groups=snapshot.groups;availabilityRows=available;const mine=available.find(row=>row.user_id===snapshot.user.id);
    if(!dirty){schedules=structuredClone(mine?.days||{});recurringRules.splice(0,recurringRules.length,...structuredClone(mine?.rules||[]));availabilityRevision=mine?.revision||0;}
    groupJoinRequests.splice(0,groupJoinRequests.length,...requests.map(row=>({id:localId(row.id),cloudId:row.id,group:groups.find(g=>g.id===row.group_id)?.name||'桌遊團',groupId:row.group_id,applicant:alias(row.applicant),nickname:snapshot.people.find(p=>p.id===row.applicant)?.nickname||'申請者',status:row.status,cloudDismissed:dismissals.some(d=>d.request_id===row.id&&d.revision===row.revision)})));
    groupAnnouncements.splice(0,groupAnnouncements.length,...notices.map(row=>({id:localId(row.id),cloudId:row.id,group:row.group_name,sender:alias(row.sender),senderName:row.sender_name,title:row.title,body:row.body,recipients:row.recipients.map(alias),recipientNames:row.recipient_names,readBy:reads.some(r=>r.notice_id===row.id)?['me']:[],cloudDismissed:reads.some(r=>r.notice_id===row.id&&r.dismissed),createdAt:row.created_at})));
    ready=true;
  };
  const groupId=name=>groups.find(g=>g.name===name)?.id;
  async function command(action,name,values={}){requireCloud();await BoardGameCloud.groupCommand(action,groupId(name)||null,values);await CloudWorkspace.refresh();}
  const groupValues=form=>({name:form.elements.groupName.value.trim(),description:form.elements.description.value.trim(),open:form.elements.joinPolicy.value==='open',tags:new FormData(form).getAll('groupTag')});
  async function run(button,operation){if(button?.disabled)return;try{if(button)button.disabled=true;await operation();}catch(error){toast(error.message||'雲端操作失敗，請重試');}finally{if(button)button.disabled=false;}}
  let createId=null;
  const baseRender=render;
  render=function(){baseRender();const create=$('#createGroup');if(create)create.onclick=()=>{try{requireCloud();createId=crypto.randomUUID();$('#createGroupDialog').showModal();}catch(error){toast(error.message);}};};
  $('#createGroupForm').onsubmit=async event=>{event.preventDefault();const form=event.target;await run(form.querySelector('button.primary'),async()=>{const values=groupValues(form);if(!values.name)throw new Error('請填團名');await command('create',null,{...values,id:createId||=crypto.randomUUID()});$('#createGroupDialog').close();form.reset();showGroupInfo(values.name);toast('桌遊團已儲存到雲端');});};
  const baseInfo=showGroupInfo;
  showGroupInfo=function(name){baseInfo(name);const joined=myGroups.includes(name),pending=groupJoinRequests.find(r=>r.group===name&&r.applicant==='me'&&r.status==='pending');$('#groupJoinAction').onclick=()=>run($('#groupJoinAction'),async()=>{if(joined){if(!await exitCurrentGroup(name))return;}else await command(pending?'cancel_request':'join',name,pending?{request_id:pending.cloudId}:{});if(groupNames.includes(name))showGroupInfo(name);else $('#groupInfoDialog').close();});};
  exitCurrentGroup=async function(name){if(!myGroups.includes(name))return false;const isOwner=groupOwners[name]==='me',others=groupMemberList(name).filter(m=>m.id!=='me');if(!await showAppConfirmation({title:isOwner&&!others.length?'退出並刪除桌遊團':'退出桌遊團',message:isOwner&&!others.length?'你是最後一位成員，退出後會清理此團；個人收藏與借用歷史仍保留。':isOwner?'退出後由現有管理員優先接任團主。':'退出後會失去本團的收藏與空閒時間存取權。',confirmLabel:'確認退出',danger:isOwner&&!others.length}))return false;await command('leave',name);return true;};
  const baseManage=showGroupManagement;
  showGroupManagement=function(name){baseManage(name);const form=$('#groupEditForm');if(!form)return;form.onsubmit=event=>{event.preventDefault();run(form.querySelector('button.primary'),async()=>{const values=groupValues(form);await command('update',name,values);showGroupManagement(values.name);toast('團資料已儲存到雲端');});};
    for(const [selector,action,key] of [['[data-admin-toggle]','admin','adminToggle'],['[data-transfer-owner]','transfer','transferOwner'],['[data-remove-member]','remove_member','removeMember']])document.querySelectorAll('#groupManagement '+selector).forEach(button=>button.onclick=()=>run(button,async()=>{if(action!=='admin'&&!await showAppConfirmation({title:action==='transfer'?'移交團主？':'移除此成員？',message:'確認後會更新雲端團體與成員權限。',confirmLabel:'確認',danger:action==='remove_member'}))return;const id=button.dataset[key];await command(action,name,{user_id:id==='me'?CloudWorkspace.userId:id});if(groupRole(name,'me'))showGroupManagement(name);else $('#groupManagement').close();}));
  };
  $('#groupNoticeForm').onsubmit=event=>{event.preventDefault();const form=event.target;run(form.querySelector('button.primary'),async()=>{await command('announce',composingNoticeGroup,{title:form.elements.title.value.trim(),body:form.elements.body.value.trim()});$('#groupNoticeDialog').close();page='notifications';render();toast('團內通知已儲存並送出');});};
  const baseNotifications=renderNotifications;
  renderNotifications=function(){baseNotifications();document.querySelectorAll('[data-group-review]').forEach(button=>button.onclick=()=>run(button,async()=>{const request=groupJoinRequests.find(r=>r.id===+button.dataset.joinId);if(request)await command('review_request',request.group,{request_id:request.cloudId,status:button.dataset.groupReview});}));document.querySelectorAll('[data-read-group-notice]').forEach(button=>button.onclick=()=>run(button,async()=>{const notice=groupAnnouncements.find(n=>n.id===+button.dataset.readGroupNotice);if(notice){requireCloud();await BoardGameCloud.groupNoticeAction(notice.cloudId,false);await CloudWorkspace.refresh();}}));};
  CloudWorkspace.dismissGroupNotice=async function(kind,id){requireCloud();if(kind==='group'){const request=groupJoinRequests.find(r=>String(r.id)===String(id));if(request)await command('dismiss_request',request.group,{request_id:request.cloudId});}else{const notice=groupAnnouncements.find(n=>String(n.id)===String(id));if(notice){await BoardGameCloud.groupNoticeAction(notice.cloudId,true);await CloudWorkspace.refresh();}}};
  window.persistAvailability=async function(){clearTimeout(timer);timer=null;dirty=true;const version=++generation,days=structuredClone(schedules),rules=structuredClone(recurringRules),userId=CloudWorkspace.userId;
    queue=queue.catch(()=>{}).then(async()=>{requireCloud();if(userId!==CloudWorkspace.userId)throw new Error('Account changed');availabilityRevision=await BoardGameCloud.saveAvailability(days,rules,availabilityRevision);if(version===generation)dirty=false;const row={user_id:userId,days,rules,revision:availabilityRevision};availabilityRows=[...availabilityRows.filter(r=>r.user_id!==row.user_id),row];});
    try{await queue;return true;}catch(error){dirty=true;toast(error.message?.includes('another device')?'另一個裝置更新了時間，請重新載入後再編輯。':'空閒時間尚未儲存，請檢查連線後再試。');return false;}
  };
  function queueSave(){dirty=true;clearTimeout(timer);timer=setTimeout(()=>window.persistAvailability(),350);}
  const originalWrite=writeTimeRange;writeTimeRange=function(...args){originalWrite(...args);queueSave();};
  const originalRange=saveAvailabilityRange;saveAvailabilityRange=function(...args){originalRange(...args);queueSave();};
  const originalClear=clearVisibleOverrides;clearVisibleOverrides=function(...args){originalClear(...args);queueSave();};
  function remoteSlot(row,slot,mode){if(!row)return 0;const c=slotCoordinates(slot),days=row.days||{};if(mode==='weekly')return days[c.weekly]?.[c.index]??0;if(days[c.date]?.[c.index]!=null)return days[c.date][c.index];const [y,m,d]=c.date.split('-').map(Number),date=new Date(y,m-1,d),key=isoLocalDate(date);for(const rule of [...(row.rules||[])].reverse())if(key>=rule.startDate&&(!rule.endDate||key<=rule.endDate)&&date.getDay()===rule.weekday&&c.index>=rule.start&&c.index<rule.end)return rule.state;return days[c.weekly]?.[c.index]??0;}
  timelineState=function(slot,index,mode){const members=page==='availability'?[{id:'me'}]:groupMemberList($('#group')?.value),member=members[index];if(member?.id==='me')return readSlot(slot,mode);return remoteSlot(availabilityRows.find(row=>row.user_id===member?.id),slot,mode);};
  const baseSchedule=renderSchedule;renderSchedule=function(){baseSchedule();const footnote=[...$('#content').querySelectorAll('.footnote')].find(p=>p.textContent.includes('朋友時段為示意資料'));if(footnote)footnote.textContent='團員時間來自各自的雲端設定。';};
})();
