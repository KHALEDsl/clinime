/* Content-shaped waiting states. Prices and actions appear only after the live menu arrives. */
(()=>{'use strict';
 const decoded=new Set(),failed=new Set(),bound=new WeakSet();
 const x=(ar,en)=>App.x(ar,en),esc=value=>App.esc(value);
 function photo(src,alt=''){
  const state=failed.has(src)?'error':decoded.has(src)?'ready':'loading';
  return `<img class="clinime-loading-photo" data-loading-photo data-photo-state="${state}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false"><span class="clinime-photo-placeholder" aria-hidden="true"><span class="clinime-photo-fallback">${esc(x('الصورة غير متاحة','Photo unavailable'))}</span></span>`;
 }
 function rows({count=4,compact=false}={}){
  return `<p class="sr-only" role="status">${esc(x('جارٍ تحميل الخدمات وأسعارها','Loading treatments and prices'))}</p><div class="clinime-catalog-loading" aria-busy="true" aria-label="${esc(x('قائمة الخدمات','Treatment menu'))}">${Array.from({length:count},()=>`<div class="muse-treatment clinime-skeleton-row${compact?' muse-compact':''}" aria-hidden="true"><span class="muse-treatment-photo clinime-skeleton"></span><span class="muse-treatment-copy"><span class="clinime-skeleton clinime-skeleton-name"></span><span class="clinime-skeleton clinime-skeleton-duration"></span><span class="clinime-skeleton clinime-skeleton-price"></span></span></div>`).join('')}</div>`;
 }
 function error(){return `<section class="state-panel clinime-catalog-error"><h2>${esc(x('تعذّر تحميل الخدمات','Could not load treatments'))}</h2><p>${esc(x('تحققي من الاتصال وحاولي مجددًا لعرض الخدمات والأسعار الحالية.','Check your connection and try again to see current treatments and prices.'))}</p><button type="button" class="pill-button pill-button--secondary" data-action="retry-config">${esc(x('إعادة المحاولة','Try again'))}</button></section>`;}
 function catalog(content,options){return App.state.configStatus==='ready'?content():App.state.configStatus==='error'?error():rows(options);}
 function hydrate(){
  document.querySelectorAll('[data-loading-photo]').forEach(img=>{
   if(bound.has(img))return;bound.add(img);
   const source=img.getAttribute('src');let timer,observer;
   const finish=state=>{clearTimeout(timer);observer?.disconnect();if(!img.isConnected)return;img.dataset.photoState=state;if(state==='ready'){decoded.add(source);failed.delete(source);}else failed.add(source);};
   const loaded=async()=>{if(!img.naturalWidth){finish('error');return;}try{await img.decode?.();}catch(_){if(!img.naturalWidth){finish('error');return;}}finish('ready');};
   img.addEventListener('load',loaded,{once:true});img.addEventListener('error',()=>finish('error'),{once:true});
   if(img.complete){if(img.naturalWidth)loaded();else finish('error');return;}
   // A previous node's decoded URL does not prove this node has received its pixels.
   if(img.dataset.photoState==='ready')img.dataset.photoState='loading';
   if(img.dataset.photoState!=='loading')return;
   // A stalled optional photo must not leave a permanent animated loader. A later load can still reveal it.
   const arm=()=>{if(!timer)timer=setTimeout(()=>finish('error'),15000);};
   if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();arm();}});observer.observe(img);}else arm();
  });
 }
 window.ClinimeLoading={photo,rows,catalog,error,hydrate};
})();
