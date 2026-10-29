(function(){
  const positions=new Map(),urls=new Map();
  const baseCards=cards;
  async function url(path){const cached=urls.get(path);if(cached&&cached.until>Date.now())return cached.value;const value=await BoardGameCloud.mediaUrl(path);urls.set(path,{value,until:Date.now()+50*60*1000});return value;}
  cards=function(){baseCards();document.querySelectorAll('#cards .card').forEach(card=>{
    const game=games.find(g=>g.id===+card.dataset.id),cover=card.querySelector('.cover');if(!game||!cover)return;
    const items=(game.mediaPaths||[]).map(path=>({path}));
    // This slot accepts a genuine BGG image only after the server integration
    // supplies one. No client-side scraping or invented cover is performed.
    if(game.bggImageUrls?.length)items.unshift(...game.bggImageUrls.slice(0,3).map(url=>({url})));else if(game.bggImageUrl)items.unshift({url:game.bggImageUrl});
    if(!items.length)return;
    if(items.length>3)items.length=3;let position=positions.get(game.cloudId)||0;if(position>=items.length)position=0;
    const image=document.createElement('img');image.className='collection-gallery-image';image.alt=(game.name||game.en)+'封面';cover.prepend(image);
    const controls=document.createElement('div');controls.className='gallery-controls';controls.setAttribute('aria-label','切換桌遊圖片');
    const left=document.createElement('button'),right=document.createElement('button'),dots=document.createElement('div');left.type=right.type='button';left.textContent='‹';right.textContent='›';left.className='gallery-previous';right.className='gallery-next';left.setAttribute('aria-label','上一張圖片');right.setAttribute('aria-label','下一張圖片');dots.className='gallery-dots';dots.setAttribute('aria-label','選擇圖片');controls.append(left,dots,right);cover.append(controls);
    const dotButtons=items.map((item,index)=>{const dot=document.createElement('button');dot.type='button';dot.className='gallery-dot';dot.setAttribute('aria-label','第 '+(index+1)+' 張圖片');dot.onclick=event=>{event.stopPropagation();position=index;show();};dot.onkeydown=event=>event.stopPropagation();dots.append(dot);return dot;});
    let revision=0;
    async function show(){const current=++revision,item=items[position];positions.set(game.cloudId,position);dotButtons.forEach((dot,index)=>{dot.setAttribute('aria-current',index===position?'true':'false');});image.hidden=!item;cover.classList.toggle('gallery-photo-active',!!item);if(!item)return;
      try{const value=item.url||await url(item.path);if(current===revision&&card.isConnected)image.src=value;}catch{if(current===revision){image.hidden=true;cover.classList.remove('gallery-photo-active');image.alt='圖片暫時無法載入';}}
    }
    for(const [button,step] of [[left,-1],[right,1]]){button.onclick=event=>{event.stopPropagation();position=(position+step+items.length)%items.length;show();};button.onkeydown=event=>event.stopPropagation();}
    show();
  });};
  const baseDetails=details;
  details=function(id){baseDetails(id);const game=games.find(g=>g.id===id);if(!game||!game.cloudGameId||!window.CloudWorkspace?.canSetImages(game))return;const editButton=$('#editDetail');if(!editButton)return;
    const label=document.createElement('label');label.className='secondary collection-image-upload';label.textContent='設定桌遊圖片（設定後鎖定）';const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.hidden=true;label.append(input);editButton.after(label);
    input.onchange=async()=>{const files=[...input.files];if(!files.length)return;if(files.length>3){toast('最多設定 3 張圖片');input.value='';return;}label.setAttribute('aria-busy','true');input.disabled=true;
      try{await CloudWorkspace.saveImages(game,files);toast('圖片已儲存到雲端');details(id);}catch(error){toast(error.message||'圖片儲存失敗，請重試');}finally{input.disabled=false;label.removeAttribute('aria-busy');input.value='';}
    };
  };
  const style=document.createElement('style');style.textContent='.cover{position:relative}.collection-gallery-image{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:var(--surface,#fff);z-index:0}.collection-gallery-image[hidden]{display:none}.gallery-photo-active>b{visibility:hidden}.gallery-controls{position:absolute;inset:0;z-index:3;pointer-events:none;color:#20382d;font-size:11px}.gallery-controls>button{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:42px;min-width:36px;min-height:42px;padding:0;font-size:28px;line-height:1;background:rgba(255,255,255,.62);backdrop-filter:blur(3px);color:#20382d;border:1px solid rgba(255,255,255,.35);border-radius:8px;pointer-events:auto;box-shadow:0 1px 6px #0002}.gallery-controls .gallery-previous{left:8px}.gallery-controls .gallery-next{right:8px}.gallery-controls>button:hover,.gallery-controls>button:focus-visible{background:rgba(255,255,255,.88)}.gallery-dots{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:0;pointer-events:auto;max-width:calc(100% - 24px);height:24px;padding:0 4px;border-radius:20px;background:rgba(25,43,35,.28)}.gallery-dots .gallery-dot{position:relative;display:grid;place-items:center;inset:auto;transform:none;width:24px;height:24px;min-width:24px;min-height:24px;margin:0;padding:0;border:0;background:transparent;border-radius:50%;box-shadow:none;backdrop-filter:none;pointer-events:auto}.gallery-dot::after{content:"";width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.42);transition:background .15s,transform .15s}.gallery-dot[aria-current=true]::after{background:white;transform:scale(1.18)}.gallery-dot:focus-visible{outline:2px solid white;outline-offset:-2px}.cover:has(.gallery-controls)>b{max-width:calc(100% - 100px)}.collection-image-upload{display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--line,#dce4d5);border-radius:6px;padding:9px 12px;font-size:13px}.collection-image-upload[aria-busy=true]{opacity:.6;pointer-events:none}';document.head.append(style);
})();
