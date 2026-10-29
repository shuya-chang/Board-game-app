(function(){
  const ledger=[];
  const filters={from:'',to:'',direction:'',party:''};
  const validTime=value=>value&&Number.isFinite(Date.parse(value));
  const day=value=>validTime(value)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
  const time=value=>validTime(value)?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
  const put=record=>{const index=ledger.findIndex(r=>r.key===record.key);if(index<0)ledger.push(Object.freeze(record));else ledger[index]=Object.freeze({...ledger[index],state:record.state,returnedAt:record.returnedAt||ledger[index].returnedAt});};
  function recordRequest(request,game){
    if(!request||!game||!validTime(request.receivedAt)||!['received','returning','returned'].includes(request.status))return;
    request.expectedReturnSource=request.expectedReturnSource||(request.expectedReturnDate?'custom':'default');request.expectedReturnDate=GameCatalog.expectedReturnDate(request.expectedReturnDate,request.receivedAt);const ownerIsMe=game.owner==='me';
    if(request.incoming&&!ownerIsMe||!request.incoming&&ownerIsMe)return;
    put({key:'request:'+request.id,gameId:game.id,gameName:game.name||game.en,gameEnglish:game.en||'',ownerId:ownerIsMe?'me':game.owner,ownerName:ownerIsMe?profile.nickname:ownerName(game),borrowerId:request.incoming?request.memberId||'friend':'me',borrowerName:request.sender,direction:request.incoming?'lend':'borrow',partyKey:request.incoming?'member:'+(request.memberId||'friend'):'member:'+game.owner,partyName:request.incoming?request.sender:ownerName(game),ownerContact:request.ownerContact||'',borrowerContact:request.contact||'',phone:'',mobile:'',note:[request.loanNote?'借用者備註：'+request.loanNote:'',request.ownerLoanNote?'出借者備註：'+request.ownerLoanNote:''].filter(Boolean).join('\n'),startedAt:request.receivedAt,expectedReturnDate:request.expectedReturnDate,expectedReturnSource:request.expectedReturnSource,deposit:Object.hasOwn(request,'deposit')?request.deposit:game.deposit??null,rentalFee:Object.hasOwn(request,'rentalFee')?request.rentalFee:game.rentalFee??null,returnedAt:request.returnedAt||null,state:request.status==='returned'?'returned':request.status==='returning'?'returning':'loaned',external:false});
  }
  window.syncBorrowingRequest=recordRequest;
  function recordExternal(game,loan,returnedAt=null){
    if(!game||game.owner!=='me'||!loan||!validTime(loan.startedAt))return;
    put({key:'external:'+game.id+':'+loan.id,gameId:game.id,gameName:game.name||game.en,gameEnglish:game.en||'',ownerId:'me',ownerName:profile.nickname,borrowerId:null,borrowerName:loan.borrower,direction:'lend',partyKey:'external:'+loan.borrower+'|'+(loan.mobile||loan.phone||''),partyName:loan.borrower,ownerContact:profile.contact||'',borrowerContact:'',phone:loan.phone||'',mobile:loan.mobile||'',note:loan.note||'',startedAt:loan.startedAt,expectedReturnDate:GameCatalog.expectedReturnDate(loan.expectedReturnDate,loan.startedAt),expectedReturnSource:loan.expectedReturnSource||(loan.expectedReturnDate?'custom':'default'),deposit:loan.deposit??null,rentalFee:loan.rentalFee??null,returnedAt,state:returnedAt?'returned':'loaned',external:true});
  }
  // Capture complete, immutable participant/contact snapshots at the time of
  // receipt, not when a request is submitted or a handoff is first approved.
  const baseAccept=acceptBorrowHandoff;acceptBorrowHandoff=function(request,game,contact){const ok=baseAccept(request,game,contact);if(ok){request.deposit=game.deposit??null;request.rentalFee=game.rentalFee??null;}return ok;};
  const baseReceipt=confirmBorrowReceipt;
  confirmBorrowReceipt=function(request,game){const ok=baseReceipt(request,game);if(ok)recordRequest(request,game);return ok;};
  const baseReturnRequest=requestBorrowReturn;
  requestBorrowReturn=function(request,game){const ok=baseReturnRequest(request,game);if(ok)recordRequest(request,game);return ok;};
  const baseReturn=confirmBorrowReturn;
  confirmBorrowReturn=function(request,game){const ok=baseReturn(request,game);if(ok)recordRequest(request,game);return ok;};
  const baseExternal=GameCatalog.recordExternalLoan;
  GameCatalog.recordExternalLoan=function(game,data){const loan=baseExternal(game,data);if(loan)recordExternal(game,loan);return loan;};
  const baseExternalReturn=GameCatalog.returnExternalLoan;
  GameCatalog.returnExternalLoan=function(game,id){const snapshot=game?.manualLoan?{...game.manualLoan}:null;if(snapshot)recordExternal(game,snapshot);const result=baseExternalReturn(game,id);if(result)recordExternal(game,snapshot,result.returnedAt);return result;};
  borrowRequests.forEach(request=>recordRequest(request,games.find(g=>g.id===request.collectionId)));
  games.filter(g=>g.manualLoan?.kind==='external').forEach(g=>recordExternal(g,g.manualLoan));

  function contactMarkup(record){return '<div>擁有者：'+esc(record.ownerContact||'未記錄')+'</div>'+(record.external?'<div>外部借用者</div>'+(record.phone?'<div>電話：'+esc(record.phone)+'</div>':'')+(record.mobile?'<div>手機：'+esc(record.mobile)+'</div>':'')+(!record.phone&&!record.mobile?'<div>未填電話／手機</div>':''):'<div>借用者：'+esc(record.borrowerContact||'未記錄')+'</div>');}
  function filteredRecords(){return filters.from&&filters.to&&filters.from>filters.to?[]:ledger.filter(r=>(r.ownerId==='me'||r.borrowerId==='me')&&(!filters.direction||r.direction===filters.direction)&&(!filters.party||r.partyKey===filters.party)&&(!filters.from||day(r.startedAt)>=filters.from)&&(!filters.to||day(r.startedAt)<=filters.to)).sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));}
  function exportBorrowing(){if(filters.from&&filters.to&&filters.from>filters.to){toast('結束日期不可早於開始日期');return;}const rows=[['桌遊名稱','英文名稱','借用方向','擁有者','借用者','已借出時間','預計歸還日期','日期來源','確認歸還時間','押金（元）','借用金額（元）','擁有者聯絡方式','借用者聯絡方式','外部電話','外部手機','特別備註','狀態'],...filteredRecords().map(r=>[r.gameName,r.gameEnglish,r.direction==='lend'?'我借出':'我借入',r.ownerName,r.borrowerName,time(r.startedAt),r.expectedReturnDate,r.expectedReturnSource==='custom'?'自行設定':'預設兩週',validTime(r.returnedAt)?time(r.returnedAt):'',r.deposit??'',r.rentalFee??'',r.ownerContact,r.borrowerContact,r.phone,r.mobile,r.note,{loaned:'已借出',returning:'歸還中',returned:'已歸還'}[r.state]])];exportExcel({rows,sheetName:'借用清單',fileName:'借用清單.xlsx',message:'已匯出目前篩選的借用紀錄'});}
  function renderRows(){
    const invalid=filters.from&&filters.to&&filters.from>filters.to;
    $('#borrowingFilterError').textContent=invalid?'結束日期不可早於開始日期':'';
    const records=filteredRecords();
    $('#borrowingCount').textContent='共 '+records.length+' 筆紀錄';
    $('#borrowingRows').innerHTML=records.length?'<div class="borrowing-table-scroll"><table class="borrowing-table"><thead><tr><th>桌遊名稱</th><th>借用方向</th><th>擁有者</th><th>借用者</th><th>已借出時間</th><th>預計歸還日期</th><th>確認歸還時間</th><th>押金</th><th>借用金額</th><th>聯絡資訊</th><th>特別備註</th><th>狀態</th></tr></thead><tbody>'+records.map(r=>'<tr><td><strong>'+esc(r.gameName)+'</strong><small>'+esc(r.gameEnglish)+'</small></td><td>'+esc(r.direction==='lend'?'我借出':'我借入')+'</td><td>'+esc(r.ownerName)+'</td><td>'+esc(r.borrowerName)+(r.external?'<small>外部借用者</small>':'')+'</td><td>'+esc(time(r.startedAt))+'</td><td>'+esc(r.expectedReturnDate)+'<small>'+(r.expectedReturnSource==='custom'?'自行設定':'預設兩週')+'</small></td><td>'+esc(time(r.returnedAt))+'</td><td>'+esc(r.deposit==null?'—':r.deposit+' 元')+'</td><td>'+esc(r.rentalFee==null?'—':r.rentalFee+' 元')+'</td><td>'+contactMarkup(r)+'</td><td class="borrowing-note">'+esc(r.note||'—')+'</td><td><span class="loan-state-badge loan-'+(r.state==='returned'?'available':r.state==='returning'?'returning':'loaned')+'">'+{loaned:'已借出',returning:'歸還中',returned:'已歸還'}[r.state]+'</span></td></tr>').join('')+'</tbody></table></div>':'<div class="empty">'+(ledger.length?'沒有符合篩選條件的借用紀錄。':'尚無已完成交接的借用紀錄。進入「已借出」後會自動記錄。')+'</div>';
  }
  function renderBorrowingList(){
    document.querySelectorAll('nav button').forEach(button=>button.classList.toggle('active',button.dataset.page==='borrowing'));
    const parties=[...new Map(ledger.map(r=>[r.partyKey,r.partyName])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'zh-Hant'));
    $('#content').innerHTML=header('借用清單','只顯示你參與的借出與借入紀錄，所有紀錄唯讀。')+'<section class="section"><div class="borrowing-filters"><label>借出日期起<input type="date" id="borrowingFrom" value="'+esc(filters.from)+'"></label><label>借出日期迄<input type="date" id="borrowingTo" value="'+esc(filters.to)+'"></label><label>借用方向<select id="borrowingDirection"><option value="">全部</option><option value="lend" '+(filters.direction==='lend'?'selected':'')+'>我借出</option><option value="borrow" '+(filters.direction==='borrow'?'selected':'')+'>我借入</option></select></label><label>交易對象<select id="borrowingParty"><option value="">全部對象</option>'+parties.map(([value,name])=>'<option value="'+esc(value)+'" '+(filters.party===value?'selected':'')+'>'+esc(name)+(value.startsWith('external:')?'（外部）':'')+'</option>').join('')+'</select></label><button type="button" class="secondary" id="clearBorrowingFilters">清除篩選</button></div><p id="borrowingFilterError" role="alert"></p><p class="footnote">日期以確認「已借出」的時間篩選；歸還時間由擁有者確認收回後記錄。特別備註於借用時填寫，此處僅供閱讀。</p><div class="borrowing-list-heading"><p id="borrowingCount"></p><button type="button" class="secondary" id="exportBorrowingExcel">匯出 Excel</button></div><div id="borrowingRows"></div></section>';
    for(const [id,key] of [['borrowingFrom','from'],['borrowingTo','to'],['borrowingDirection','direction'],['borrowingParty','party']])$('#'+id).onchange=e=>{filters[key]=e.target.value;renderRows();};
    $('#exportBorrowingExcel').onclick=exportBorrowing;$('#clearBorrowingFilters').onclick=()=>{Object.assign(filters,{from:'',to:'',direction:'',party:''});renderBorrowingList();};renderRows();
  }
  const previousRender=render;
  render=function(){if(page==='borrowing')renderBorrowingList();else previousRender();};
  if(page==='borrowing')renderBorrowingList();
})();
