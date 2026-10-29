const assert=require('node:assert/strict');
const {dismissBorrow}=require('../features/notification-flow.cjs');
for(const status of ['pending','needs_contact','handoff','received','returning','returned']){
  const request={collectionId:1,status,returnRequestedAt:'old'},copy={id:1,loanStage:status==='received'?'loaned':status,loan:{id:'loan'},borrowerId:'borrower'};
  const before=structuredClone(copy),changed=dismissBorrow(request,copy);
  if(['pending','needs_contact','handoff'].includes(status)){assert(changed);assert.equal(request.status,'cancelled');}
  else if(status==='returning'){assert(changed);assert.equal(request.status,'received');assert.equal(copy.loanStage,'loaned');assert.equal(copy.borrowerId,'borrower');}
  else{assert(!changed);assert.deepEqual(copy,before);}
  assert(!dismissBorrow(request,copy),'dismissal must be idempotent');
}
assert(!dismissBorrow({collectionId:2,status:'handoff'},{id:1,loanStage:'handoff',loan:{}}));
console.log('Notification dismissal states passed');
