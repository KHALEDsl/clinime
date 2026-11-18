/* Local review workspace. Fictional preview records never read or write a live review service. */
(() => {
  'use strict';
  const R = window.StaffRuntime, B = window.StaffBridge, E = R.E;
  const local = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const number = new Intl.NumberFormat('ar-SA-u-nu-latn', {maximumFractionDigits:1});
  const date = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'});
  const labels = {pending:'بانتظار المراجعة',published:'منشور محليًا',archived:'مؤرشف'};
  let owner='', rows=[], tab='all', query='', rating='', sort='newest', pageNumber=1, pageSize=10, selected=new Set(), undo=null, notice='', storageError='';
  let dialog=null, opener=null, dialogReview='', drafts=new Map(), ownsDirty=false;
  const account = () => String(R.state.user?.id || R.state.user?.email || '');
  const key = () => 'clinime-local-reviews-v1:'+encodeURIComponent(owner);
  const normalize = text => String(text).normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLowerCase().trim();
  const star = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 1.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.7-5 2.7.9-5.6-4-3.9 5.6-.8Z"/></svg>';
  const stars = value => '<span class="rv-stars" role="img" aria-label="'+number.format(value)+' من 5">'+Array.from({length:5},(_,i)=>'<span class="'+(i<value?'is-filled':'')+'">'+star+'</span>').join('')+'</span>';
  function seed() {
    const names=['نورة السالم','ريم الحربي','سارة العلي','دلال العبدالله','هند القحطاني','أمل العتيبي','لينا الراشد','عبير الدوسري','مها الناصر','جود الشمري','رنا الغامدي','شهد الزهراني'];
    const services=['تنظيف البشرة الأساسي','استشارة البشرة','موعد ليزر','استشارة تجميلية'];
    const comments=['الحجز كان واضحًا، ووصلني تأكيد الموعد بسهولة. الاستقبال رحّب بي وشرح لي الخطوة التالية.','كان التعامل في الاستقبال لطيفًا، وأعجبني وضوح وقت الموعد وتفاصيل الحجز.','احتجت إلى تعديل موعدي، وكان الوصول إلى تفاصيل الحجز سهلًا. أتمنى إضافة توضيح أكثر لسياسة التعديل.','المكان مرتب، لكن انتظرت أكثر من الوقت المتوقع دون تحديث عن مدة الانتظار.','تجربة الحجز مريحة، وتفاصيل السعر والوقت كانت واضحة قبل التأكيد.','واجهت صعوبة في معرفة مكان العيادة من رسالة التأكيد. سيكون وجود رابط الموقع مفيدًا.','استقبلتني الموظفة باهتمام وأجابت عن أسئلتي حول الموعد. شكرًا على التنظيم.','لم تكن مدة الانتظار واضحة عند الوصول. أتمنى إبلاغ العميلة عند تأخر موعدها.'];
    return Array.from({length:48},(_,i)=>({id:'demo-review-'+(i+1),name:names[i%12],service:services[i%4],text:comments[i%8],rating:[5,5,4,3,5,4,5,2][i%8],at:new Date(Date.UTC(2026,10,4-i,10,i%60)).toISOString(),status:i%8===7?'archived':i%8===3?'pending':'published',reply:''}));
  }
  function load() {
    const next=account();
    if(owner===next)return;
    closeDetail();
    owner=next;rows=[];selected.clear();undo=null;notice='';storageError='';drafts.clear();tab='all';query='';rating='';pageNumber=1;
    if(!local||!owner)return;
    const sample=seed();
    try {
      const saved=JSON.parse(localStorage.getItem(key())||'null');
      if(saved && saved.version===1 && Array.isArray(saved.rows)) {
        rows=sample.map(base=>{const value=saved.rows.find(r=>r.id===base.id);return value?{...base,status:Object.hasOwn(labels,value.status)?value.status:base.status,reply:typeof value.reply==='string'?value.reply.slice(0,1500):''}:base;});
      } else rows=sample;
    } catch (_) { rows=sample;storageError='تعذّر قراءة الحفظ المحلي. التغييرات الجديدة تحتاج إلى إتاحة التخزين في المتصفح.'; }
  }
  function persist(next) {
    if(!local||!owner||owner!==account())return false;
    try {localStorage.setItem(key(),JSON.stringify({version:1,rows:next.map(({id,status,reply})=>({id,status,reply}))}));rows=next;storageError='';return true;}
    catch (_) {storageError='لم يُحفظ التغيير. أتيحي التخزين في المتصفح ثم أعيدي المحاولة.';return false;}
  }
  function filtered() {
    const q=normalize(query);
    return rows.filter(r=>(tab==='all'||r.status===tab)&&(!rating||r.rating===Number(rating))&&(!q||normalize(r.name+' '+r.service+' '+r.text).includes(q))).sort((a,b)=>sort==='oldest'?a.at.localeCompare(b.at):sort==='lowest'?a.rating-b.rating||b.at.localeCompare(a.at):sort==='highest'?b.rating-a.rating||b.at.localeCompare(a.at):b.at.localeCompare(a.at));
  }
  function view() {
    const all=filtered(), pages=Math.max(1,Math.ceil(all.length/pageSize));pageNumber=Math.max(1,Math.min(pageNumber,pages));
    const visible=all.slice((pageNumber-1)*pageSize,pageNumber*pageSize), ids=new Set(visible.map(r=>r.id));
    selected=new Set([...selected].filter(id=>ids.has(id)));
    return {all,pages,visible};
  }
  function repaint(focus, cursor) {
    B.render();
    const target=focus&&document.querySelector(focus);target?.focus();
    if(typeof cursor==='number'&&target?.setSelectionRange)target.setSelectionRange(cursor,cursor);
  }
  function resultWord(count){return count===1?'رأي واحد':count===2?'رأيان':number.format(count)+(count>=3&&count<=10?' آراء':count>=100?' رأي':' رأيًا');}
  function summary() {
    const count=rows.length, average=count?rows.reduce((a,r)=>a+r.rating,0)/count:0;
    return '<section class="rv-summary" aria-label="ملخص البيانات التوضيحية"><div class="rv-average"><strong>'+number.format(average)+'<small> / 5</small></strong>'+stars(Math.round(average))+'<span>من '+number.format(count)+' رأيًا توضيحيًا</span></div><div class="rv-distribution" aria-label="توزيع التقييمات">'+[5,4,3,2,1].map(n=>{const total=rows.filter(r=>r.rating===n).length;return '<div><span>'+n+' <span aria-hidden="true">'+star+'</span></span><meter min="0" max="'+count+'" value="'+total+'" aria-label="تقييم '+n+' من 5، '+resultWord(total)+'"></meter><small>'+number.format(total)+'</small></div>';}).join('')+'</div></section>';
  }
  function row(r) {
    const initials=r.name.split(' ').map(n=>n[0]).slice(0,2).join('');
    return '<li class="rv-row '+(selected.has(r.id)?'is-selected':'')+'"><label class="rv-select"><input type="checkbox" data-rv-select="'+r.id+'" '+(selected.has(r.id)?'checked':'')+' aria-label="تحديد رأي '+E(r.name)+'"></label><span class="rv-avatar" aria-hidden="true">'+E(initials)+'</span><article class="rv-review"><div class="rv-row-heading"><div class="rv-identity"><h2><button type="button" class="rv-name" data-rv-open="'+r.id+'">'+E(r.name)+'</button></h2><div class="rv-meta"><span>'+E(r.service)+'</span><time datetime="'+r.at+'">'+date.format(new Date(r.at))+'</time>'+(r.reply?'<span class="rv-draft-label">رد محفوظ محليًا</span>':'')+'</div></div><div class="rv-rating">'+stars(r.rating)+'<span class="rv-state '+(r.status==='pending'?'is-pending':'')+'">'+labels[r.status]+'</span><button type="button" class="rv-open" data-rv-open="'+r.id+'">عرض الرأي والرد</button></div></div><p class="rv-comment">'+E(r.text)+'</p></article></li>';
  }
  function page() {
    load();
    const heading='<header class="rv-heading"><div><h1>آراء العميلات</h1></div>'+(local&&owner?'<span class="rv-sample">بيانات توضيحية</span>':'')+'</header>';
    if(!local||!owner)return '<div class="reviews-page">'+heading+'<div class="rv-empty"><h2>لم يُربط مصدر للآراء بعد</h2><p>تظهر آراء العميلات هنا بعد ربط مصدر معتمد. لا توجد آراء مستلمة في هذه الصفحة.</p></div></div>';
    const v=view(), selectedCount=selected.size, editable=v.visible.some(r=>selected.has(r.id)&&r.status!=='archived');
    return '<div class="reviews-page">'+heading+'<p class="rv-source">أسماء وآراء خيالية. الردود والتغييرات محلية في هذا المتصفح ولا تظهر للعميلات.</p>'+summary()+
      '<section class="rv-workspace" aria-label="قائمة الآراء"><div class="rv-tabs" role="group" aria-label="حالة الرأي">'+[['all','الكل'],['pending','للمراجعة'],['published','المنشورة'],['archived','المؤرشفة']].map(([value,label])=>'<button type="button" data-rv-tab="'+value+'" aria-pressed="'+(tab===value)+'">'+label+'<span>'+number.format(value==='all'?rows.length:rows.filter(r=>r.status===value).length)+'</span></button>').join('')+'</div>'+
      '<div class="rv-toolbar"><label class="rv-search"><span class="rv-sr">البحث بالاسم أو الخدمة أو نص الرأي</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" id="rv-search" data-rv-search placeholder="ابحثي بالاسم، الخدمة، أو الرأي" value="'+E(query)+'"></label><label class="rv-control"><span>التقييم</span><select data-rv-rating><option value="">كل التقييمات</option>'+[5,4,3,2,1].map(n=>'<option value="'+n+'" '+(rating===String(n)?'selected':'')+'>'+n+' من 5</option>').join('')+'</select></label><label class="rv-control"><span>الترتيب</span><select data-rv-sort>'+[['newest','الأحدث أولًا'],['oldest','الأقدم أولًا'],['lowest','الأقل تقييمًا'],['highest','الأعلى تقييمًا']].map(([value,label])=>'<option value="'+value+'" '+(sort===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div>'+
      '<div class="rv-selectionbar"><label><input type="checkbox" data-rv-select-page '+(v.visible.length&&selectedCount===v.visible.length?'checked':'')+' '+(!v.visible.length?'disabled':'')+' aria-label="تحديد آراء هذه الصفحة فقط"><span>'+(selectedCount?'المحدد في هذه الصفحة: '+number.format(selectedCount):'تحديد هذه الصفحة')+'</span></label><span class="rv-resultcount" role="status" aria-live="polite">'+resultWord(v.all.length)+'</span>'+(selectedCount?'<button type="button" data-rv-bulk '+(!editable?'disabled':'')+'>أرشفة المحدد</button><button type="button" data-rv-clear>إلغاء التحديد</button>':'')+'</div>'+
      '<div class="rv-feedback" role="status" aria-live="polite" '+(!notice&&!undo?'hidden':'')+'><span>'+E(notice)+'</span>'+(undo?'<button type="button" data-rv-undo>تراجع عن الأرشفة</button>':'')+'</div>'+(storageError?'<p class="rv-error" role="alert">'+E(storageError)+'</p>':'')+
      (v.visible.length?'<ul class="rv-list">'+v.visible.map(row).join('')+'</ul>':'<div class="rv-empty"><h2>لا توجد آراء مطابقة</h2><p>جرّبي اسمًا أو خدمة أخرى، أو اعرضي كل الآراء.</p><button type="button" data-rv-reset>مسح الفلاتر</button></div>')+
      '<footer class="rv-pagination"><label>عدد الآراء في الصفحة<select data-rv-size>'+[10,20].map(n=>'<option '+(pageSize===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label><span>'+(v.all.length?number.format((pageNumber-1)*pageSize+1)+' إلى '+number.format(Math.min(pageNumber*pageSize,v.all.length))+' من '+number.format(v.all.length):'0 من 0')+'</span><div><button type="button" data-rv-page="'+(pageNumber-1)+'" '+(pageNumber<=1?'disabled':'')+'>السابق</button><span>صفحة '+number.format(pageNumber)+' من '+number.format(v.pages)+'</span><button type="button" data-rv-page="'+(pageNumber+1)+'" '+(pageNumber>=v.pages?'disabled':'')+'>التالي</button></div></footer></section></div>';
  }
  function clearDirty(){if(ownsDirty){R.state.dirty=false;ownsDirty=false;}}
  function closeDetail() {
    if(!dialog)return;
    const previousId=dialogReview, input=dialog.querySelector('textarea');if(input)drafts.set(dialogReview,input.value);
    dialog.close();dialog.remove();dialog=null;dialogReview='';clearDirty();
    if(opener?.isConnected)opener.focus();else (document.querySelector('[data-rv-open="'+previousId+'"]')||document.querySelector('[data-rv-search]'))?.focus();opener=null;
  }
  function openDetail(id, trigger) {
    load();const r=rows.find(r=>r.id===id);if(!r)return;
    closeDetail();dialogReview=id;opener=trigger;dialog=document.createElement('dialog');dialog.className='rv-dialog';dialog.setAttribute('dir','rtl');dialog.setAttribute('aria-labelledby','rv-detail-heading');
    dialog.innerHTML='<div class="rv-dialog-heading"><div><h2 id="rv-detail-heading">رأي '+E(r.name)+'</h2><p>'+E(r.service)+'</p></div><button type="button" data-rv-close aria-label="إغلاق الرأي">×</button></div><div class="rv-dialog-content"><div class="rv-detail-meta">'+stars(r.rating)+'<time datetime="'+r.at+'">'+date.format(new Date(r.at))+'</time></div><p class="rv-detail-text">'+E(r.text)+'</p><div class="rv-moderation"><span data-rv-detail-state class="rv-state">'+labels[r.status]+'</span><button type="button" data-rv-status="'+(r.status==='archived'?'pending':'archived')+'">'+(r.status==='archived'?'استعادة للمراجعة':'أرشفة الرأي')+'</button>'+(r.status!=='published'?'<button type="button" data-rv-status="published">تعليم كمنشور محليًا</button>':'')+'</div><form data-rv-reply><label for="rv-reply">مسودة الرد</label><textarea id="rv-reply" name="reply" rows="5" maxlength="1500" aria-describedby="rv-reply-help">'+E(drafts.get(id)??r.reply)+'</textarea><p id="rv-reply-help">يُحفظ الرد في هذا المتصفح فقط. لا يُرسل للعميلة ولا يُنشر.</p><div class="rv-reply-footer"><span data-rv-draft-state>'+((drafts.get(id)??r.reply)!==r.reply?'تعديل غير محفوظ':'')+'</span><button type="submit" class="primary">حفظ الرد</button></div><p data-rv-dialog-feedback role="status" aria-live="polite"></p></form></div>';
    document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});dialog.showModal();
    if((drafts.get(id)??r.reply)!==r.reply){ownsDirty=true;R.state.dirty=true;}
  }
  function archive(ids) {
    const visibleIds=new Set(view().visible.map(r=>r.id)), target=new Set(ids.filter(id=>visibleIds.has(id)));
    const previous=rows.filter(r=>target.has(r.id)&&r.status!=='archived').map(r=>({id:r.id,status:r.status}));
    if(!previous.length)return;
    if(persist(rows.map(r=>previous.some(p=>p.id===r.id)?{...r,status:'archived'}:r))){undo={owner,previous};notice='أُرشفت الآراء المحددة في هذه النسخة المحلية.';selected.clear();}
    repaint('[data-rv-search]');
  }
  document.addEventListener('click',event=>{
    const t=event.target.closest('[data-rv-tab],[data-rv-open],[data-rv-bulk],[data-rv-clear],[data-rv-reset],[data-rv-page],[data-rv-undo],[data-rv-close],[data-rv-status]');if(!t)return;
    if(t.matches('[data-rv-close]'))return closeDetail();
    if(!local||!owner||account()!==owner)return;
    if(t.matches('[data-rv-open]'))return openDetail(t.dataset.rvOpen,t);
    if(t.matches('[data-rv-status]')&&dialog){const r=rows.find(r=>r.id===dialogReview),status=t.dataset.rvStatus;if(!r||!Object.hasOwn(labels,status))return;const previous=r.status;if(persist(rows.map(row=>row.id===r.id?{...row,status}:row))){if(status==='archived')undo={owner,previous:[{id:r.id,status:previous}]};else undo=null;notice=status==='archived'?'أُرشف الرأي في هذه النسخة المحلية.':status==='published'?'عُلّم الرأي كمنشور في هذه النسخة المحلية فقط.':'استُعيد الرأي للمراجعة.';const savedDraft=dialog.querySelector('textarea').value;drafts.set(r.id,savedDraft);const oldOpener=opener;closeDetail();repaint();openDetail(r.id,document.querySelector('[data-rv-open="'+r.id+'"]')||oldOpener);dialog.querySelector('[data-rv-dialog-feedback]').textContent=notice;dialog.querySelector('[data-rv-close]').focus();}else dialog.querySelector('[data-rv-dialog-feedback]').textContent=storageError;return;}
    if(t.matches('[data-rv-tab]')){tab=t.dataset.rvTab;pageNumber=1;selected.clear();return repaint('[data-rv-tab="'+tab+'"]');}
    if(t.matches('[data-rv-bulk]'))return archive([...selected]);
    if(t.matches('[data-rv-clear]')){selected.clear();return repaint('[data-rv-select-page]');}
    if(t.matches('[data-rv-reset]')){query='';rating='';tab='all';pageNumber=1;selected.clear();return repaint('[data-rv-search]');}
    if(t.matches('[data-rv-page]')){pageNumber=Number(t.dataset.rvPage);selected.clear();return repaint('[data-rv-select-page]');}
    if(t.matches('[data-rv-undo]')&&undo?.owner===owner){const previous=undo.previous;if(persist(rows.map(r=>{const old=previous.find(p=>p.id===r.id);return old?{...r,status:old.status}:r;}))){undo=null;notice='تم التراجع عن الأرشفة في هذه النسخة المحلية.';}return repaint('[data-rv-search]');}
  });
  document.addEventListener('input',event=>{
    const t=event.target;
    if(t.matches('[data-rv-search]')){query=t.value;pageNumber=1;selected.clear();repaint('[data-rv-search]',t.selectionStart);}
    if(dialog&&t.id==='rv-reply'){const r=rows.find(r=>r.id===dialogReview);ownsDirty=t.value!==r?.reply;R.state.dirty=ownsDirty;dialog.querySelector('[data-rv-draft-state]').textContent=ownsDirty?'تعديل غير محفوظ':'';dialog.querySelector('[data-rv-dialog-feedback]').textContent='';}
  });
  document.addEventListener('change',event=>{
    const t=event.target;
    if(t.matches('[data-rv-select]')){t.checked?selected.add(t.dataset.rvSelect):selected.delete(t.dataset.rvSelect);return repaint('[data-rv-select="'+t.dataset.rvSelect+'"]');}
    if(t.matches('[data-rv-select-page]')){selected=t.checked?new Set(view().visible.map(r=>r.id)):new Set();return repaint('[data-rv-select-page]');}
    if(t.matches('[data-rv-rating],[data-rv-sort],[data-rv-size]')){const selector=t.matches('[data-rv-rating]')?'[data-rv-rating]':t.matches('[data-rv-sort]')?'[data-rv-sort]':'[data-rv-size]';if(selector==='[data-rv-rating]')rating=t.value;else if(selector==='[data-rv-sort]')sort=t.value;else pageSize=Number(t.value)===20?20:10;pageNumber=1;selected.clear();repaint(selector);}
  });
  document.addEventListener('submit',event=>{
    if(!event.target.matches('[data-rv-reply]')||!dialog)return;event.preventDefault();
    const id=dialogReview,reply=String(new FormData(event.target).get('reply')||'').trim().slice(0,1500);
    if(persist(rows.map(r=>r.id===id?{...r,reply}:r))){drafts.set(id,reply);dialog.querySelector('textarea').value=reply;clearDirty();dialog.querySelector('[data-rv-draft-state]').textContent='';dialog.querySelector('[data-rv-dialog-feedback]').textContent='حُفظ الرد في هذه النسخة المحلية';notice='حُفظ الرد في هذه النسخة المحلية';repaint();}
    else dialog.querySelector('[data-rv-dialog-feedback]').textContent=storageError;
  });
  window.addEventListener('hashchange',()=>{closeDetail();selected.clear();});
  B.onClear(()=>{closeDetail();owner='';rows=[];selected.clear();undo=null;drafts.clear();notice='';storageError='';});
  window.StaffReviews={page};
})();
