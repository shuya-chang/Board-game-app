(function(root){
  const mechanicMap={
    'deck, bag, and pool building':'牌庫構築','deck building':'牌庫構築',
    'hand management':'手牌管理','open drafting':'卡牌輪抽','closed drafting':'卡牌輪抽','card drafting':'卡牌輪抽',
    'set collection':'成套收集','trick-taking':'吃墩','multi-use cards':'一卡多用',
    'worker placement':'工人放置','tile placement':'板塊放置','dice placement':'骰子放置',
    'auction / bidding':'競標','area majority / influence':'區域控制','area control / area influence':'區域控制',
    'hidden roles':'陣營','bluffing':'吹牛','negotiation':'談判','memory':'記憶',
    'push your luck':'Push Your Luck','dice rolling':'擲骰','paper-and-pencil':'紙筆',
    'real-time':'即時行動','role playing':'角色扮演','legacy game':'傳承',
    'scenario / mission / campaign game':'劇本'
  };
  const categoryMap={'abstract strategy':'抽象','deduction':'推理','wargame':'戰爭','adventure':'冒險','civilization':'文明','economic':'經濟','racing':'競速','trivia':'你問我答','puzzle':'解謎','party game':'派對'};
  const subdomainMap={'strategy games':'策略','family games':'家庭','party games':'派對','abstract games':'抽象','wargames':'戰爭'};
  const mechanicTypes={'cooperative game':'合作','semi-cooperative game':'半合作','solo / solitaire game':null};
  const rankLabels={boardgame:'總排名',strategygames:'策略類排名',wargames:'戰爭類排名',familygames:'家庭類排名',partygames:'派對類排名',abstracts:'抽象類排名',thematic:'主題類排名',cgs:'可構築類排名',childrensgames:'兒童類排名'};
  const commonFields=['name','en','min','max','time','timeBasis','mechanisms','type','description','bggId','bggRanks','difficulty','recommendation','color','title','bggUnknown'];
  const personalFields=['status','actualTime','actualTimeBasis','ownerRecommendation','note','deposit','rentalFee'];
  const key=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  const identity=g=>g.bggId?'bgg:'+g.bggId:g.gameKey||String(g.id);
  function availableCopyCount(copies){return copies.reduce((sum,g)=>{if(['願望清單','已賣出'].includes(g.status)||g.loan||['handoff','loaned','returning'].includes(g.loanStage))return sum;const quantity=g.quantity==null?1:Number(g.quantity);return sum+(Number.isFinite(quantity)&&quantity>0?Math.floor(quantity):0);},0);}
  function expectedReturnDate(value,from=new Date().toISOString()){if(/^\d{4}-\d{2}-\d{2}$/.test(value||'')){const parsed=new Date(value+'T00:00:00Z');if(!Number.isNaN(+parsed)&&parsed.toISOString().slice(0,10)===value)return value;}const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(from));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return new Date(Date.UTC(+p.year,+p.month-1,+p.day+14)).toISOString().slice(0,10);}
  function mapTags(data={}){
    const mechanisms=[],types=[],unknown=[];
    for(const [group,values,map,destination] of [['mechanism',data.mechanisms||[],mechanicMap,mechanisms],['category',data.categories||[],categoryMap,types],['subdomain',data.subdomains||[],subdomainMap,types]]){
      for(const item of values){const name=typeof item==='string'?item:item.name||item.value||'';const normalized=key(name);if(map[normalized])destination.push(map[normalized]);else if(group==='mechanism'&&Object.hasOwn(mechanicTypes,normalized)){if(mechanicTypes[normalized])types.push(mechanicTypes[normalized]);}else if(name)unknown.push({group,name,id:typeof item==='object'?item.id||null:null});}
    }
    for(const item of data.mechanisms||[]){const name=typeof item==='string'?item:item.name||item.value||'';if(mechanicTypes[key(name)])types.push(mechanicTypes[key(name)]);}
    return {mechanisms:[...new Set(mechanisms)],types:[...new Set(types)],unknown};
  }
  function ranks(raw=[]){return raw.map(r=>{const value=Number(r.value);return {...r,label:r.label||rankLabels[r.name]||r.friendlyname||r.name||'分類排名',value:Number.isInteger(value)&&value>0?value:null,overall:r.name==='boardgame'||r.type==='subtype'&&String(r.id)==='1'};});}
  function bestRank(raw=[]){return ranks(raw).filter(r=>r.value!==null).sort((a,b)=>a.value-b.value||Number(b.overall)-Number(a.overall)||a.label.localeCompare(b.label,'zh-Hant'))[0]||null;}
  function search(items,name,en){const queries=[name,en].map(key).filter(Boolean);if(!queries.length)return [];const seen=new Set();return items.filter(g=>{const id=identity(g);if(seen.has(id)||!queries.some(q=>[g.name,g.en].some(n=>key(n).includes(q))))return false;seen.add(id);return true;});}
  function selectCandidate(items,index){return Number.isInteger(index)&&index>=0&&index<items.length?items[index]:null;}
  function pickCommon(g){return Object.fromEntries(commonFields.filter(k=>g[k]!==undefined).map(k=>[k,structuredClone(g[k])]));}
  function conflicts(current,incoming){return commonFields.filter(k=>!['bggId','bggRanks','bggUnknown','color','title'].includes(k)&&current[k]!=null&&current[k]!==''&&incoming[k]!=null&&incoming[k]!==''&&JSON.stringify(current[k])!==JSON.stringify(incoming[k])).map(field=>({field,current:current[field],incoming:incoming[field]}));}
  function mergeBgg(current,incoming,choices={}){const result={...current};delete result.yearPublished;delete result.edition;for(const field of commonFields){if(incoming[field]===undefined)continue;const differs=conflicts(current,incoming).some(c=>c.field===field);if(!differs||choices[field]==='bgg'||['bggId','bggRanks','bggUnknown','difficulty','recommendation'].includes(field))result[field]=structuredClone(incoming[field]);}for(const field of personalFields)if(Object.hasOwn(current,field))result[field]=current[field];return result;}
  function canFillDescription(copies,user='me'){return !copies.some(g=>String(g.description||'').trim())&&copies.some(g=>g.owner===user&&!['願望清單','已賣出'].includes(g.status));}
  function recordExternalLoan(game,data){if(!game||game.owner!=='me'||['願望清單','已賣出'].includes(game.status)||game.loan||game.borrowerId&&game.borrowerId!==game.owner||['handoff','loaned','returning'].includes(game.loanStage)||!String(data.name||'').trim())return null;const startedAt=new Date().toISOString();const loan={id:Date.now(),kind:'external',borrower:String(data.name).trim(),phone:String(data.phone||'').trim(),mobile:String(data.mobile||'').trim(),note:String(data.note||'').trim(),startedAt,expectedReturnDate:expectedReturnDate(data.expectedReturnDate,startedAt),expectedReturnSource:data.expectedReturnDate?'custom':'default',deposit:game.deposit??null,rentalFee:game.rentalFee??null};game.loan=loan.borrower;game.loanStage='loaned';game.manualLoan=loan;return loan;}
  function returnExternalLoan(game,expectedId){if(!game||game.owner!=='me'||game.manualLoan?.kind!=='external'||game.manualLoan.id!==expectedId||game.loanStage!=='loaned')return null;const history={gameId:game.id,borrower:game.loan,external:true,...structuredClone(game.manualLoan),returnedAt:new Date().toISOString()};game.loan=null;game.loanContact=null;game.loanStage='available';delete game.manualLoan;return history;}
  function normalizedMinutes(value,basis='whole',minimumPlayers=null){if(value==null||value===''||!Number.isFinite(Number(value))||Number(value)<=0)return null;if(basis==='per-person'){if(!Number.isInteger(Number(minimumPlayers))||Number(minimumPlayers)<1)return null;return Number(value)*Number(minimumPlayers);}return Number(value);}
  function actualTimeLabel(copy){if(copy.actualTime==null||copy.actualTime==='')return '';const minutes=normalizedMinutes(copy.actualTime,copy.actualTimeBasis,copy.min);return copy.actualTimeBasis==='per-person'?'每人 '+copy.actualTime+' 分鐘'+(minutes==null?'（未有最少人數）':'（最低 '+minutes+' 分鐘）'):copy.actualTime+' 分鐘';}
  function averageActualTime(copies,memberIds){const allowed=new Set(memberIds),people=new Map();for(const copy of copies){const value=normalizedMinutes(copy.actualTime,copy.actualTimeBasis,copy.min);if(!allowed.has(copy.owner)||value==null||value===''||!Number.isFinite(Number(value))||Number(value)<=0||people.has(copy.owner))continue;people.set(copy.owner,Number(value));}return people.size?[...people.values()].reduce((sum,value)=>sum+value,0)/people.size:null;}
  function averageOwnerRating(copies,memberIds){const allowed=new Set(memberIds),people=new Map();for(const copy of copies){const value=copy.ownerRecommendation;if(!allowed.has(copy.owner)||value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>10||people.has(copy.owner))continue;people.set(copy.owner,Number(value));}return people.size?[...people.values()].reduce((sum,value)=>sum+value,0)/people.size:null;}
  const api={averageOwnerRating,normalizedMinutes,actualTimeLabel,averageActualTime,mechanicMap,categoryMap,subdomainMap,rankLabels,commonFields,personalFields,identity,availableCopyCount,expectedReturnDate,mapTags,ranks,bestRank,search,selectCandidate,pickCommon,conflicts,mergeBgg,canFillDescription,recordExternalLoan,returnExternalLoan};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GameCatalog=api;
})(typeof globalThis!=='undefined'?globalThis:this);
