(function(){
  let advancedOpen=false;
  const primary=['search','scope','players','playabilityFilter'];
  const advanced=['type','mechanismFilter','duration','maxDifficulty','minRecommendation','currentHolderFilter','originalOwnerFilter','loanFilter','collectionStatusFilter'];
  const dimensions=[['difficulty','BGG 難度'],['recommendation','BGG 推薦度'],['ownerRecommendation','玩家推薦度'],['actualTime','玩家時間']];
  const setters={search:value=>query=value,players:value=>players=value,type:value=>type=value,mechanismFilter:value=>mechanismFilter=value,duration:value=>duration=value,maxDifficulty:value=>maxDifficulty=value,minRecommendation:value=>minRecommendation=value,currentHolderFilter:value=>currentHolderFilter=value,originalOwnerFilter:value=>originalOwnerFilter=value,loanFilter:value=>loanFilter=value,collectionStatusFilter:value=>collectionStatusFilter=value,playabilityFilter:value=>playabilityFilter=value};
  function valueFor(id,input){return id==='type'?type:id==='mechanismFilter'?mechanismFilter:input?.value||'';}
  function multiPicker(id,title,options){
    const input=$('#'+id);if(!input)return null;input.hidden=true;input.setAttribute('aria-hidden','true');input.tabIndex=-1;
    const picker=document.createElement('details');picker.className='collection-multi-picker';picker.dataset.filterPicker=id;
    const summary=document.createElement('summary');summary.dataset.multiSummary=id;picker.append(summary);
    const panel=document.createElement('div');panel.className='collection-multi-options';panel.setAttribute('role','group');panel.setAttribute('aria-label',title+'複選');
    const selected=valueFor(id,input).split('|');for(const option of options){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=option;check.setAttribute('aria-label',option);check.checked=selected.includes(option);check.onchange=()=>{setters[id]([...panel.querySelectorAll('input:checked')].map(box=>box.value).join('|'));cards();};label.append(check,document.createTextNode(option));panel.append(label);}
    const hint=document.createElement('small');hint.textContent='可複選，符合其中一項即可';panel.append(hint);picker.append(panel,input);return picker;
  }
  function refresh(){
    const toggle=$('#toggleAdvancedRules'),chips=$('#collectionFilterChips');if(!toggle||!chips)return;
    const active=Object.keys(setters).map(id=>({id,input:$('#'+id)})).filter(({id,input})=>input&&valueFor(id,input)&&(id!=='collectionStatusFilter'||scope==='me'));
    const advancedCount=active.filter(({id})=>advanced.includes(id)).length;
    toggle.textContent='進階規則'+(advancedCount?'（'+advancedCount+'）':'')+(advancedOpen?' ▴':' ▾');
    toggle.setAttribute('aria-expanded',String(advancedOpen));$('#advancedCollectionRules').hidden=!advancedOpen;
    for(const [field,label] of dimensions){const button=$('#sort-'+field);if(!button)continue;const ascending=sortOrder===field+'-asc',descending=sortOrder===field+'-desc';button.textContent=label+(ascending?' ↑ 升序':descending?' ↓ 降序':'');button.setAttribute('aria-pressed',String(ascending||descending));}
    for(const [id,title] of [['type','類型'],['mechanismFilter','機制']]){const summary=document.querySelector('[data-multi-summary="'+id+'"]'),selected=valueFor(id,$('#'+id)).split('|').filter(Boolean);if(summary)summary.textContent=selected.length?title+'（'+selected.length+'）':'所有'+title;}
    chips.replaceChildren();
    for(const {id,input} of active){const chip=document.createElement('button');chip.type='button';chip.className='collection-filter-chip';const label=id==='search'?'名稱：'+input.value:id==='type'||id==='mechanismFilter'?(id==='type'?'類型：':'機制：')+valueFor(id,input).split('|').join('、'):input.selectedOptions?.[0]?.textContent||input.value;chip.textContent=label+' ×';chip.setAttribute('aria-label','移除篩選：'+label);chip.onclick=()=>{setters[id]('');render();};chips.append(chip);}
    $('#clearCollectionFilters').hidden=!active.length;
  }
  function arrange(){
    const toolbar=$('#content .toolbar');if(!toolbar)return;
    const main=document.createElement('div');main.className='collection-primary-filters';
    const extra=document.createElement('div');extra.id='advancedCollectionRules';extra.className='collection-advanced-filters';
    for(const id of primary){const input=$('#'+id);if(input)main.append(input);}
    for(const id of advanced){const input=id==='type'?multiPicker(id,'類型',boardGameTypes()):id==='mechanismFilter'?multiPicker(id,'機制',boardGameMechanisms()):$('#'+id);if(input)extra.append(input);}
    const toggle=document.createElement('button');toggle.type='button';toggle.id='toggleAdvancedRules';toggle.className='secondary';toggle.setAttribute('aria-controls',extra.id);toggle.onclick=()=>{advancedOpen=!advancedOpen;refresh();};main.append(toggle);
    const nativeSort=$('#sortOrder');if(nativeSort){nativeSort.hidden=true;nativeSort.setAttribute('aria-hidden','true');nativeSort.tabIndex=-1;}
    const actions=document.createElement('div');actions.className='collection-result-actions';
    for(const [field,label] of dimensions){const sort=document.createElement('button');sort.type='button';sort.id='sort-'+field;sort.className='secondary collection-sort-button';sort.title=label+'：依序切換升序、降序、預設';sort.onclick=()=>{sortOrder=sortOrder===field+'-asc'?field+'-desc':sortOrder===field+'-desc'?'default':field+'-asc';if(nativeSort)nativeSort.value=sortOrder;cards();};actions.append(sort);}
    const clear=document.createElement('button');clear.type='button';clear.id='clearCollectionFilters';clear.className='secondary';clear.textContent='清除篩選';clear.onclick=()=>{Object.values(setters).forEach(set=>set(''));render();};actions.append(clear);
    const exportButton=$('#export');if(exportButton)actions.append(exportButton);
    const chips=document.createElement('div');chips.id='collectionFilterChips';chips.className='collection-filter-chips';chips.setAttribute('aria-label','目前篩選條件');
    toolbar.replaceChildren(main,extra,chips,actions);if(nativeSort)toolbar.append(nativeSort);refresh();
  }
  const baseCards=cards;cards=function(){baseCards();refresh();};
  const baseRender=render;render=function(){baseRender();if(page==='collection')arrange();};
  if(page==='collection')arrange();
})();
