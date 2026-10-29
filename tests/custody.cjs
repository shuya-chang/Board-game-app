const assert=require('node:assert/strict'),C=require('../features/custody.cjs');
const context={me:'me',teamIds:['me','b'],people:[{id:'me',name:'A'},{id:'b',name:'B'},{id:'z',name:'Z'}],requests:[]};
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};
const original={id:1,owner:'me',status:'自己收藏'};
eq(C.view(original,context).holderId,'me');eq(C.availableCount([original],context),1);
const handoff={...original,loan:'B',borrowerId:'b',loanStage:'handoff'};
eq(C.view(handoff,context).holderId,'me');eq(C.availableCount([handoff],context),0);
const received={...handoff,loanStage:'loaned'};
eq(C.view(received,context).holderId,'b');eq(C.view(received,context).ownerId,'me');eq(C.availableCount([received],context),1);
eq(C.matches([received],{ownerId:'me',holderId:'b'},context),true);
eq(C.matches([received],{ownerId:'b',holderId:'me'},context),false);
const imported={id:2,owner:'z',originalOwnerName:'Z',status:'自己收藏',loan:'B',borrowerId:'b',loanStage:'loaned'};
eq(C.view(imported,context).visible,true);eq(C.availableCount([imported],context),1);eq(C.matches([imported],{ownerId:'z',holderId:'b'},context),true);
eq(C.view({...imported,loanStage:'handoff'},context).visible,false);
eq(C.view({...imported,loanStage:'returning'},context).visible,true);eq(C.availableCount([{...imported,loanStage:'returning'}],context),0);
const returned={...imported,loan:null,borrowerId:null,loanStage:'available'};
eq(C.view(returned,context).holderId,'z');eq(C.view(returned,context).visible,false);eq(C.availableCount([returned],context),0);
eq(C.availableCount([original,received],context),1); // one physical ID, not two copies
eq(C.availableCount([original,{...original,id:99,physicalCopyId:1}],context),1);
eq(C.availableCount([received,imported],context),2);
eq(C.matches([original,imported],{ownerId:'me',holderId:'b'},context),false); // both filters must match the same box
const toOutside={...original,loan:'Z',borrowerId:'z',loanStage:'loaned'};
eq(C.view(toOutside,context).visible,true);eq(C.availableCount([toOutside],context),0);
const external={...original,loan:'B',loanStage:'loaned',manualLoan:{id:100,kind:'external',borrower:'B'}};
eq(C.view(external,context).holderKind,'external');eq(C.availableCount([external],context),0); // text name is not a selected account
eq(C.availableCount([{...original,status:'已賣出'},{...original,id:3,status:'願望清單'}],context),0);
const borrowingContext={...context,requests:[{collectionId:7,incoming:false,status:'received',sender:'A'}]};
const legacy={id:7,owner:'z',status:'自己收藏',loan:'A',loanStage:'loaned'};
eq(C.view(legacy,borrowingContext).holderId,'me');eq(C.view(legacy,borrowingContext).visible,true);
eq(C.view({...imported,borrowerId:'z',loan:'Z'},context).visible,false);
const fs=require('node:fs'),vm=require('node:vm'),ui=fs.readFileSync(require('node:path').join(__dirname,'../features/custody-ui.js'),'utf8');
const tooltipContext={GameCatalog:require('../features/game-catalog.cjs')};vm.createContext(tooltipContext);for(const name of ['publicInfo','holderTooltip'])vm.runInContext(ui.split('\n').find(line=>line.trimStart().startsWith('function '+name+'(')),tooltipContext);
const text=tooltipContext.holderTooltip([{copy:{ownerRecommendation:0,actualTime:50,deposit:12345,rentalFee:67890,note:'PRIVATE',loanContact:'CONTACT'},info:{holderName:'B',borrowed:false,quantity:1,stage:'available',available:true}},{copy:{ownerRecommendation:9,actualTime:90},info:{holderName:'B',ownerName:'A',borrowed:true,quantity:1,stage:'loaned',available:true}}]);
eq(text.includes('自有 1 盒'),true);eq(text.includes('向 A 借入 1 盒'),true);eq(text.includes('原擁有者 A 的公開資訊\n推薦度：9 / 10'),true);eq(text.includes('推薦度：0 / 10'),true);eq(text.includes('PRIVATE'),false);eq(text.includes('CONTACT'),false);eq(text.includes('12345'),false);eq(text.includes('67890'),false);eq(text.includes('押金'),false);eq(text.includes('借用金額'),false);
eq(C.borrowBlockReason({id:1},[{collectionId:1,incoming:false,status:'needs_contact'}]).label,'待補充聯絡方式');eq(C.borrowBlockReason({id:1},[{collectionId:1,incoming:false,status:'pending'}]).label,'借用請求待回覆');eq(C.borrowBlockReason({id:1,loanStage:'loaned'},[{collectionId:1,incoming:false,status:'received'}]).label,'你已借到此桌遊');eq(C.borrowBlockReason({id:1,loanStage:'returning'}).label,'歸還確認中');eq(C.borrowBlockReason({id:1,loanStage:'handoff'}).label,'借出中');eq(C.borrowBlockReason({id:1,owner:'a',borrowerId:'b'}).label,'不在擁有者手上');
console.log(n+' physical-copy, holder, owner, cross-group visibility and availability checks passed.');
