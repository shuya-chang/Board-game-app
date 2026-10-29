(function(root){
  const states={owned:'自己收藏',wishlist:'願望清單',sold:'已賣出'};
  function payload(record,note){
    const tags=value=>Array.isArray(value)?value:String(value||'').split(/[,，]/).map(t=>t.trim()).filter(Boolean);
    return {common:{name:record.name||'',english_name:record.en||'',description:record.description||'',min_players:record.min??null,max_players:record.max??null,standard_minutes:record.time??null,standard_basis:record.timeBasis==='per-person'?'person':'whole',mechanisms:tags(record.mechanisms),categories:tags(record.type)},personal:{status:record.status==='願望清單'?'wishlist':record.status==='已賣出'?'sold':'owned',recommendation:record.ownerRecommendation??null,actual_minutes:record.actualTime??null,actual_basis:record.actualTimeBasis==='per-person'?'person':'whole',deposit:record.deposit??null,fee:record.rentalFee??null,note}};
  }
  function hydrate(rows,terms,userId,idFor){
    const privateTerms=new Map(terms.map(t=>[t.collection_id,t]));
    return rows.filter(c=>!c.archived_at).map(c=>{
      const g=c.catalog_games,t=c.owner_id===userId?privateTerms.get(c.id):null;
      if(!g)throw new Error('收藏缺少桌遊資料，請稍後重新載入');
      return {id:idFor(c.id),cloudId:c.id,physicalCopyId:c.id,cloudGameId:g.id,mediaPaths:g.image_paths||[],bggImageUrls:g.bgg_image_urls||[],imageSource:g.image_source||'pending',imageOwner:g.image_owner,gameKey:g.id,name:g.name,en:g.english_name,min:g.min_players,max:g.max_players,time:g.standard_minutes,timeBasis:g.standard_basis==='person'?'per-person':'whole',mechanisms:g.mechanisms.join(','),type:g.categories.join(','),description:g.description,bggId:g.bgg_id,bggRanks:g.bgg_ranks,difficulty:g.bgg_difficulty,recommendation:g.bgg_recommendation,owner:c.owner_id===userId?'me':c.owner_id,status:states[c.status],actualTime:c.actual_minutes,actualTimeBasis:c.actual_basis==='person'?'per-person':'whole',ownerRecommendation:c.recommendation,deposit:t?.deposit??null,rentalFee:t?.fee??null,color:'#577567',title:g.english_name||g.name,loan:null,loanStage:'available'};
    });
  }
  const api={payload,hydrate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CloudCollectionModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
