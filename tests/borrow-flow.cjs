const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const functions=['validContact','loanState','collectionRemovalBlocked','collectionCanLend','acceptBorrowHandoff','confirmBorrowReceipt','requestBorrowReturn','confirmBorrowReturn','borrowRequestActions'];
const ctx={borrowRequests:[],loanHistory:[]};vm.createContext(ctx);
for(const name of functions){const line=html.split('\n').find(l=>l.startsWith('function '+name+'('));assert(line,'Missing '+name);vm.runInContext(line,ctx)}
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};
const g={id:101,owner:'me',name:'測試桌遊'},r={id:1,collectionId:101,incoming:true,status:'pending',sender:'小安',contact:'測試聯絡方式'};ctx.borrowRequests=[r];
eq(ctx.collectionRemovalBlocked(g),false);
eq(ctx.acceptBorrowHandoff(r,g,''),false);
const missingContact={...r,contact:'  '};eq(ctx.acceptBorrowHandoff(missingContact,g,'出借者聯絡方式'),false);
eq(ctx.acceptBorrowHandoff({...r,incoming:false},g,'出借者聯絡方式'),false);
eq(ctx.acceptBorrowHandoff(r,{...g,owner:'friend'},'出借者聯絡方式'),false);
eq(ctx.acceptBorrowHandoff(r,g,'出借者聯絡方式'),true);eq(ctx.loanState(g),'handoff');eq(ctx.collectionRemovalBlocked(g),true);
eq(ctx.acceptBorrowHandoff(r,g,'出借者聯絡方式'),false);
eq(ctx.confirmBorrowReceipt(r,g),false);
r.incoming=false;g.owner='friend';eq(ctx.confirmBorrowReceipt(r,g),true);eq(ctx.loanState(g),'loaned');eq(ctx.collectionRemovalBlocked(g),true);eq(ctx.confirmBorrowReceipt(r,g),false);
eq(ctx.requestBorrowReturn({...r,incoming:true},g),false);eq(ctx.requestBorrowReturn(r,{...g,owner:'me'}),false);eq(ctx.requestBorrowReturn(r,g),true);eq(ctx.loanState(g),'returning');eq(ctx.collectionRemovalBlocked(g),true);eq(ctx.requestBorrowReturn(r,g),false);
eq(ctx.confirmBorrowReturn(r,g),false);r.incoming=true;g.owner='me';eq(ctx.confirmBorrowReturn(r,g),true);eq(ctx.loanState(g),'available');eq(ctx.collectionRemovalBlocked(g),false);eq(ctx.loanHistory.length,1);eq(ctx.confirmBorrowReturn(r,g),false);eq(ctx.loanHistory.length,1);
for(const status of ['handoff','received','returning']){ctx.borrowRequests=[{collectionId:g.id,status}];eq(ctx.collectionRemovalBlocked({...g,loan:null,loanStage:'available'}),true);eq(ctx.collectionRemovalBlocked({id:999}),false)}
for(const stage of ['handoff','loaned','returning'])eq(ctx.collectionRemovalBlocked({id:999,loanStage:stage}),true);
eq(ctx.borrowRequestActions({id:1,status:'handoff',incoming:true}).includes('已收到'),false);eq(ctx.borrowRequestActions({id:1,status:'handoff',incoming:false}).includes('已收到'),true);eq(ctx.borrowRequestActions({id:1,status:'received',incoming:false}).includes('我要歸還'),true);eq(ctx.borrowRequestActions({id:1,status:'returning',incoming:true}).includes('是，已收回'),true);
// Exercise the actual async removal handler, including a loan starting while its confirmation is open.
const handler=html.match(/document.querySelector\('#editorRemoveCollection'\).onclick=async\(\)=>\{[^\n]+/)[0];
(async()=>{for(const scenario of ['active','became-active','available']){const item={id:1,owner:'me',name:'測試桌遊',loan:scenario==='active'?'小安':null};const elements={'#editorRemoveCollection':{},'#editor':{close(){}}};Object.assign(ctx,{games:[item],editing:1,borrowRequests:[],document:{querySelector:s=>elements[s]},toast(){},render(){},showAppConfirmation:async options=>{if(options.noticeOnly)return true;if(scenario==='became-active')item.loan='小安';return true}});vm.runInContext(handler,ctx);await elements['#editorRemoveCollection'].onclick();eq(ctx.games.length,scenario==='available'?0:1)}for(const status of ['pending','needs_contact','handoff','received','returning']){ctx.borrowRequests=[{id:500,collectionId:900,status}];eq(ctx.collectionCanLend({id:900,owner:'me',status:'自己收藏'}),false);eq(ctx.collectionCanLend({id:901,owner:'me',status:'自己收藏'}),true)}
ctx.borrowRequests=[];eq(ctx.collectionCanLend({id:900,owner:'me',borrowerId:'friend',status:'自己收藏'}),false);for(const status of ['願望清單','已賣出'])eq(ctx.collectionCanLend({id:900,owner:'me',status}),false);
for(const stage of ['handoff','loaned','returning'])eq(ctx.collectionCanLend({id:900,owner:'me',status:'自己收藏',loanStage:stage}),false);
console.log(checks+' borrow lifecycle, permissions, duplicate-action and deletion-race checks passed.');})().catch(e=>{console.error(e);process.exitCode=1});
