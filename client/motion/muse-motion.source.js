import { animate } from 'motion';
/* Motion is driven by the visitor's gesture, scroll or actual state change. No loops or fake waits. */
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let release=[],depth=[],raf=0,mountFrame=0,lastRoute='',navRect=null,activeSheet=null,input='pointer',swallow=false;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const physics=v=>{const w=2*Math.PI/.3;return{type:'spring',mass:1,stiffness:w*w,damping:2*w,velocity:v,restDelta:.5,restSpeed:5}};
function listen(el,event,handler,options){el.addEventListener(event,handler,options);release.push(()=>el.removeEventListener(event,handler,options));}
function clean(){release.forEach(f=>f());release=[];depth=[];if(activeSheet){activeSheet.animation?.stop();activeSheet=null;}}
function paint(){raf=0;if(reduce.matches)return;for(const item of depth){const r=item.host.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)continue;const p=item.hero?clamp(-r.top/(r.height*.9),0,1):clamp((innerHeight-r.top)/(innerHeight+r.height),0,1);item.img.style.transform=item.hero?`translateY(${p*36}px) scale(${1.03+p*.12})`:`translateY(${(p-.5)*18}px) scale(1.07)`;if(item.title)item.title.style.transform=`translateY(${p*16}px)`;}}
function onScroll(){if(!raf)raf=requestAnimationFrame(paint);}
window.addEventListener('scroll',onScroll,{passive:true});
window.addEventListener('keydown',()=>input='keyboard',true);
window.addEventListener('pointerdown',e=>{input='pointer';swallow=false;const nav=e.target.closest('.muse-nav,.floating-nav');if(nav)navRect=nav.querySelector('.muse-nav-track')?.getBoundingClientRect()||nav.querySelector('.is-active')?.getBoundingClientRect();},true);
window.addEventListener('click',e=>{if(swallow&&e.detail){swallow=false;e.preventDefault();e.stopImmediatePropagation();}},true);
function dragRail(el){let g=null,a=null;
 const stop=()=>{a?.stop();a=null;};
 listen(el,'pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||!e.isPrimary)return;stop();g={id:e.pointerId,x:e.clientX,y:e.clientY,origin:el.scrollLeft,last:e.clientX,time:e.timeStamp,v:0,dragging:false};});
 listen(el,'pointermove',e=>{if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.dragging){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;if(Math.abs(dy)>Math.abs(dx)){g=null;return;}g.dragging=true;el.setPointerCapture(e.pointerId);el.classList.add('is-dragging');}if(e.timeStamp>g.time){g.v=(e.clientX-g.last)/(e.timeStamp-g.time)*1000;g.last=e.clientX;g.time=e.timeStamp;}el.scrollLeft=g.origin-dx;e.preventDefault();});
 const end=(e,cancel=false)=>{if(!g||g.id!==e.pointerId)return;const old=g;g=null;el.classList.remove('is-dragging');if(!old.dragging)return;swallow=true;if(cancel||reduce.matches)return;const v=e.timeStamp-old.time>80?0:-old.v,max=el.scrollWidth-el.clientWidth,rtl=getComputedStyle(el).direction==='rtl',target=clamp(el.scrollLeft+v*.12,rtl?-max:0,rtl?0:max);a=animate(el.scrollLeft,target,{...physics(v),onUpdate:n=>el.scrollLeft=n});};
 listen(el,'pointerup',e=>end(e));listen(el,'pointercancel',e=>end(e,true));listen(el,'scroll',onScroll,{passive:true});release.push(stop);
}
function trackNavigation(){const nav=document.querySelector('.muse-nav,.floating-nav'),selected=nav?.querySelector('.is-active');if(!nav||!selected)return;const r=nav.getBoundingClientRect(),s=selected.getBoundingClientRect(),marker=document.createElement('i');marker.className='muse-nav-track';marker.setAttribute('aria-hidden','true');const end=`translate(${s.left-r.left}px,${s.top-r.top}px)`;Object.assign(marker.style,{width:s.width+'px',height:s.height+'px',transform:end});nav.prepend(marker);nav.classList.add('has-motion');release.push(()=>{marker.remove();nav.classList.remove('has-motion');});if(navRect&&!reduce.matches&&input!=='keyboard'&&Math.abs(navRect.left-s.left)>1){animate(marker,{transform:[`translate(${navRect.left-r.left}px,${s.top-r.top}px)`,end]},{type:'spring',duration:.28,bounce:0});}navRect=s;}
function sheet(d,opening){const grip=document.createElement('div');grip.className='muse-sheet-grip';grip.setAttribute('aria-hidden','true');d.prepend(grip);release.push(()=>{grip.remove();d.style.transform='';});const s=activeSheet={el:d,y:0,animation:null,drag:null,closing:false};
 const paintY=y=>{s.y=y;d.style.transform=`translateY(${y}px)`;};
 const stop=()=>{s.animation?.stop();s.animation=null;};
 const settle=(target,velocity=0,done)=>{stop();if(reduce.matches||input==='keyboard'){paintY(0);done?.();return;}s.animation=animate(s.y,target,{...physics(velocity),onUpdate:paintY});const a=s.animation;a.finished.then(()=>{if(s.animation===a&&d.isConnected){paintY(target);done?.();}});};
 if(opening&&!reduce.matches&&input!=='keyboard'){paintY(52);settle(0);}
 listen(d,'pointerdown',e=>{if(!e.isPrimary||e.button!==0||s.drag||App.state.pending||App.state.recovery||!e.target.closest('.muse-sheet-grip,.dialog-header')||e.target.closest('button'))return;stop();s.closing=false;s.drag={id:e.pointerId,y:e.clientY,origin:s.y,last:e.clientY,time:e.timeStamp,v:0};e.target.setPointerCapture(e.pointerId);});
 listen(d,'pointermove',e=>{const g=s.drag;if(!g||g.id!==e.pointerId)return;if(e.timeStamp>g.time){g.v=(e.clientY-g.last)/(e.timeStamp-g.time)*1000;g.time=e.timeStamp;g.last=e.clientY;}const y=g.origin+e.clientY-g.y;if(!reduce.matches)paintY(y<0?y*.18:y);});
 const end=(e,cancel=false)=>{const g=s.drag;if(!g||g.id!==e.pointerId)return;s.drag=null;const dy=e.clientY-g.y,v=e.timeStamp-g.time>80?0:g.v;if(!cancel&&(dy>110||dy>24&&v>650)){s.closing=true;settle(d.offsetHeight+32,Math.max(0,v),()=>{if(s.closing)d.querySelector('[data-action=close-modal]')?.click();});}else settle(0,v);};
 listen(d,'pointerup',e=>end(e));listen(d,'pointercancel',e=>end(e,true));
}
let sheetKey='';
function mount(){mountFrame=0;const route=window.App?.state.route||'',m=App?.state.modal,key=m?m.type+':'+(m.serviceId||''):'';clean();
 if(route==='home'){const cover=document.querySelector('.muse-cover');if(cover)depth.push({host:cover,img:cover.querySelector('.muse-cover-image'),title:cover.querySelector('.muse-display'),hero:true});document.querySelectorAll('.muse-category-photo,.muse-treatments .muse-treatment-photo,.muse-consult>div,.muse-space').forEach(host=>{const img=host.querySelector('img');if(img)depth.push({host,img});});}
 document.querySelectorAll('.muse-category-rail,.muse-filters,.day-strip').forEach(dragRail);trackNavigation();
 const main=document.getElementById('main-content');if(lastRoute&&lastRoute!==route&&input!=='keyboard'&&main){main.animate(reduce.matches?[{opacity:.7},{opacity:1}]:[{opacity:.5,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0px)'}],{duration:reduce.matches?100:200,easing:'cubic-bezier(.23,1,.32,1)'});}lastRoute=route;
 const d=document.getElementById('active-dialog');if(d?.open)sheet(d,key!==sheetKey);sheetKey=key;paint();
}
function queue(){if(!mountFrame)mountFrame=requestAnimationFrame(mount);}
window.addEventListener('resize',queue,{passive:true});
const app=document.getElementById('app'),overlay=document.getElementById('overlay');if(app)new MutationObserver(queue).observe(app,{childList:true});if(overlay)new MutationObserver(queue).observe(overlay,{childList:true});
reduce.addEventListener('change',()=>{clean();document.querySelectorAll('.muse-cover-image,.muse-display,.muse-category img,.muse-treatment img,.muse-consult img,.muse-space img').forEach(el=>el.style.transform='none');queue();});
window.ClinimeMuseMotion={mount:queue,version:'1.0'};
