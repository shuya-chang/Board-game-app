(function(root){
  const quantity=g=>g.quantity==null?1:Math.max(0,Math.floor(Number(g.quantity)||0));
  function view(copy,context){
    const me=context.me||'me',people=context.people||[],team=new Set(context.teamIds||[me]);
    const name=(id,fallback)=>people.find(p=>p.id===id)?.name||fallback||'團外使用者';
    const physical=!['願望清單','已賣出'].includes(copy.status);
    const ownerId=copy.status==='願望清單'?null:copy.owner;
    const ownerName=name(copy.owner,copy.originalOwnerName||copy.ownerNickname);
    const request=(context.requests||[]).find(r=>r.collectionId===copy.id&&['handoff','received','returning'].includes(r.status));
    const active=!!copy.loan||!!copy.borrowerId&&['handoff','loaned','returning'].includes(copy.loanStage);
    const stage=active?(copy.loanStage|| (request?.status==='returning'?'returning':request?.status==='handoff'?'handoff':'loaned')):'available';
    let holderId=physical?copy.owner:null,holderName=physical?ownerName:'無目前持有人',holderKind=physical?'member':'none';
    if(physical&&active&&stage!=='handoff'){
      const external=copy.manualLoan?.kind==='external';
      let borrowerId=external?null:copy.borrowerId||request?.borrowerId||(request?.incoming===false?me:request?.memberId);
      if(!borrowerId&&!external){const matches=people.filter(p=>p.name===(copy.borrowerName||copy.loan||request?.sender));if(matches.length===1)borrowerId=matches[0].id;}
      holderId=borrowerId||'external:'+copy.id+':'+(copy.manualLoan?.id||copy.loan||'unknown');
      holderName=name(borrowerId,copy.manualLoan?.borrower||copy.borrowerName||copy.loan||request?.sender||'外部借用者');holderKind=borrowerId?'member':'external';
    }
    return {copyId:String(copy.physicalCopyId??copy.id),ownerId,ownerName,holderId,holderName,holderKind,physical,stage,borrowed:!!holderId&&holderId!==ownerId,visible:copy.owner===me||physical&&(team.has(ownerId)||team.has(holderId)),available:physical&&team.has(holderId)&&['available','loaned'].includes(stage),quantity:quantity(copy)};
  }
  function unique(copies,context){const map=new Map();for(const copy of copies){const info=view(copy,context),prior=map.get(info.copyId);if(!prior||prior.info.stage==='available'||info.stage!=='available')map.set(info.copyId,{copy,info});}return [...map.values()];}
  function availableCount(copies,context){return unique(copies,context).reduce((sum,{info})=>sum+(info.available?info.quantity:0),0);}
  function matches(copies,filters,context){return unique(copies,context).some(({info})=>(!filters.ownerId||info.ownerId===filters.ownerId)&&(!filters.holderId||info.holderId===filters.holderId));}
  function borrowBlockReason(copy,requests=[]){
    const active=requests.find(r=>r.collectionId===copy.id&&['handoff','received','returning'].includes(r.status));
    const stage=copy.loanStage==='returning'||active?.status==='returning'?'returning':copy.loanStage==='handoff'||active?.status==='handoff'?'handoff':copy.loanStage==='loaned'||active?.status==='received'||copy.loan?'loaned':null;
    if(stage==='returning')return {label:'歸還確認中',message:'這盒正在歸還，等待擁有者確認收回後才能再次借用。'};
    if(stage==='handoff')return {label:active?.incoming===false?'等待你確認收到':'借出中',message:'這盒已安排借出，正在等待借用者確認收到，不能重複申請。'};
    if(stage==='loaned')return {label:active?.incoming===false?'你已借到此桌遊':'已借出',message:'這盒尚未歸還，不能再次提出借用請求。'};
    if(copy.borrowerId&&copy.borrowerId!==copy.owner)return {label:'不在擁有者手上',message:'這盒目前由借用者持有，須由原擁有者收回後才能再次出借。'};
    const pending=requests.find(r=>r.collectionId===copy.id&&['pending','needs_contact'].includes(r.status));
    if(pending?.incoming===false&&pending.status==='needs_contact')return {label:'待補充聯絡方式',message:'你已有一筆借用請求，請到通知補充聯絡方式後重新送出，或取消原請求。'};
    if(pending)return {label:pending.incoming===false?'借用請求待回覆':'已有請求待處理',message:'這盒已有尚未處理完的借用請求，請等待回覆或先取消原請求。'};
    return {label:'目前無可出借的收藏',message:'這款桌遊目前沒有符合出借條件的實體收藏。'};
  }
  const api={view,unique,availableCount,matches,borrowBlockReason};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Custody=api;
})(typeof globalThis!=='undefined'?globalThis:this);
