(function(root){
  function dismissBorrow(request,copy){
    if(!request||!copy||request.collectionId!==copy.id)return false;
    if(['pending','needs_contact'].includes(request.status)){request.status='cancelled';request.cancelledAt=new Date().toISOString();return true;}
    if(request.status==='handoff'&&copy.loanStage==='handoff'&&copy.loan){
      request.status='cancelled';request.cancelledAt=new Date().toISOString();copy.loan=null;copy.loanContact=null;copy.loanStage='available';delete copy.borrowerId;return true;
    }
    if(request.status==='returning'&&copy.loanStage==='returning'&&copy.loan){request.status='received';copy.loanStage='loaned';delete request.returnRequestedAt;return true;}
    // Receipt-confirmed loans and completed history are never completed or
    // undone merely because a notification is dismissed.
    return false;
  }
  const api={dismissBorrow};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NotificationFlow=api;
})(typeof globalThis!=='undefined'?globalThis:this);
