/* Local review of the merchant's decision workspace. No outbound campaigns or live writes. */
(() => {
  'use strict';
  const R = window.StaffRuntime, B = window.StaffBridge, D = window.StaffGrowthData;
  if (!R || !B || !D || !['127.0.0.1','localhost','[::1]'].includes(location.hostname)) return;
  const E = R.E, oldHome = window.home;
  const number = n => new Intl.NumberFormat('ar-SA', {maximumFractionDigits:0}).format(Number(n) || 0);
  const date = (s, options = {weekday:'long',day:'numeric',month:'short'}) => s ? new Date(s.slice(0,10) + 'T12:00:00+03:00').toLocaleDateString('ar-SA-u-ca-gregory',options) : 'غير مسجل';
  const money = n => number(n) + ' ر.س';
  const icons = {
    arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>', chevron:'<path d="m14 6-6 6 6 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>', plus:'<path d="M12 5v14M5 12h14"/>',
    bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3zm5 3h4"/>',
    trend:'<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
    file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h5"/>',
    box:'<path d="m3 7 9-4 9 4-9 5zm0 0v10l9 4 9-4V7M12 12v9M7 5l10 5"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    link:'<path d="m10 13 4-4m-7 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 5 1 1a4 4 0 0 0 6-6l-5-5a4 4 0 0 0-6 0" transform="translate(2 2) scale(.85)"/>',
    save:'<path d="M4 3h13l3 3v15H4zm3 0v6h10V3M8 21v-7h8v7"/>', refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name]||icons.info) + '</svg>';
  const btn = (label, action, cls = '', attrs = '') => '<button type="button" class="g-btn '+cls+'" data-growth="'+action+'" '+attrs+'>'+label+'</button>';
  let filter = 'active', focusDay = '', model, current = null, planBuffer = null, opener = null;
  let store = {version:1,actions:{},competitors:[]}, storageOK = true, owner = '';
  function key() { return 'clinime-growth-review-v1:' + (R.state.user?.id || 'local'); }
  function load() {
    const id = key(); if (owner===id) return; owner=id;
    try { const value=JSON.parse(localStorage.getItem(id)||'null'); store=value?.version===1&&value.actions&&typeof value.actions==='object'&&Array.isArray(value.competitors)?value:{version:1,actions:{},competitors:[]};store.actions=Object.fromEntries(Object.entries(store.actions).filter(([k,a])=>a&&a.id===k&&a.recommendation&&['draft','approved','monitoring','deferred','done'].includes(a.status)));store.competitors=store.competitors.filter(c=>c&&typeof c.name==='string'&&typeof c.service==='string'&&Number.isFinite(c.price)&&c.price>=0&&typeof c.url==='string'); }
    catch { store={version:1,actions:{},competitors:[]}; storageOK=false; }
  }
  function persist() { try { localStorage.setItem(key(),JSON.stringify(store));storageOK=true;return true; } catch { storageOK=false;return false; } }
  function saveLocal() { const ok=persist();if(!ok)notice('تعذّر حفظ التغيير في المتصفح. يبقى متاحًا لهذه الجلسة فقط.');return ok; }
  function scopedRecommendation(rec) {
    const evidence=Object.fromEntries(Object.entries(rec.evidence||{}).filter(([k])=>!['asOf','before','comparableDays'].includes(k)));
    const text=JSON.stringify([rec.targetIds,evidence]);let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return {...rec,id:rec.id+'~'+(hash>>>0).toString(36)};
  }
  function notice(text) { B.feedback(text); }
  function activeAction(rec) { const saved=store.actions[rec.id]; return !saved || saved.status==='deferred'&&Date.parse(saved.until)<Date.now(); }
  function recommendationIcon(type) { return ({retention:'people','quieter-day':'calendar','stock-low':'box','checkout-unpaid':'file','visit-unresolved':'clock','catalog-incomplete':'file'})[type]||'target'; }
  function reasonFor(rec) {
    if(rec.type==='retention')return 'عميلات لهن زيارات مكتملة سابقة، وما عندهن موعد قادم. راجعي قائمة المتابعة وجهّزي دعوة مناسبة.';
    if(rec.type==='checkout-unpaid')return 'إجمالي الرصيد المتبقي '+money(model.summary.unpaidCheckoutAmount)+'. افتحي الزيارة لمراجعة التحصيل.';
    if(rec.type==='quieter-day'){
      const day=model.forecast.days.find(d=>d.date===rec.evidence.date);
      const count=rec.count, booked=count===0?'لا توجد مواعيد مؤكدة':count===1?'موعد واحد مؤكد':count===2?'موعدان مؤكدان':number(count)+(count<=10?' مواعيد مؤكدة':' موعدًا مؤكدًا');
      return 'لهذا اليوم '+booked+'.'+(day?.estimate?' وفي الأيام المماثلة سابقًا سُجلت '+number(day.estimate.low)+' إلى '+number(day.estimate.high)+' زيارات مكتملة.':'');
    }
    return rec.reason;
  }
  function recommendationCount(count) {return count===0?'لا توصيات إضافية':count===1?'توصية واحدة':count===2?'توصيتان':number(count)+(count<=10?' توصيات':' توصية');}
  function unitLabel(rec) {
    const one=rec.count===1, two=rec.count===2, few=rec.count>=3&&rec.count<=10;
    return ({retention:one?'عميلة للمتابعة':two?'عميلتان للمتابعة':few?'عميلات للمتابعة':'عميلة للمتابعة','catalog-incomplete':one?'خدمة تحتاج تحسين':two?'خدمتان تحتاجان تحسينًا':few?'خدمات تحتاج تحسينًا':'خدمة تحتاج تحسينًا','stock-low':one?'مادة تحتاج مراجعة':two?'مادتان تحتاجان مراجعة':few?'مواد تحتاج مراجعة':'مادة تحتاج مراجعة','checkout-unpaid':one?'زيارة بمتبقٍ':two?'زيارتان بمتبقٍ':few?'زيارات بمتبقٍ':'زيارة بمتبقٍ','visit-unresolved':one?'زيارة تحتاج حسمًا':two?'زيارتان تحتاجان حسمًا':few?'زيارات تحتاج حسمًا':'زيارة تحتاج حسمًا','quieter-day':'مواعيد مؤكدة'})[rec.type]||'سجلات للمراجعة';
  }
  function sourceLabel() { return R.state.workspace?.growthPreview?.isSample ? 'بيانات توضيحية للمعاينة المحلية' : 'من سجلات العيادة المحمّلة'; }
  function heading() {
    return '<header class="g-heading"><div><p class="g-date">'+date(model.today)+'</p><h1>أولويات كلينيمي</h1><p>خطوات واضحة لتحسين الحجز، وعودة العميلات، وتجربة العناية.</p></div><a class="g-btn" href="#appointments">'+icon('calendar')+'جدول المواعيد</a></header>';
  }
  function primary(rec) {
    if (!rec) return '<section class="g-priority g-quiet"><div class="g-section-label">أولوية اليوم</div><h2>مساحة أوضح لاتخاذ القرار.</h2><p>ما عندك توصية جديدة تحتاج إجراء الآن. راجعي الخطط المحفوظة أو أضيفي بيانات العيادة لظهور فرص جديدة.</p>'+btn('عرض المتابعة','show-tracking','g-primary')+'</section>';
    return '<section class="g-priority"><div class="g-section-label">أولوية اليوم <span>من سجلات العيادة</span></div><div class="g-priority-body"><div><h2>'+E(rec.title)+'</h2><p>'+E(reasonFor(rec))+'</p><div class="g-priority-bottom">'+btn(E(rec.actionLabel)+' '+icon('arrow'),'open:'+rec.id,'g-primary')+btn('لماذا هذه الأولوية؟','why:'+rec.id,'g-text')+'</div></div><div class="g-priority-number"><strong>'+number(rec.count)+'</strong><span>'+unitLabel(rec)+'</span></div></div></section>';
  }
  function opportunities(recs) {
    return '<section class="g-opportunities"><header class="g-section-head"><h2>خطوات تستحق انتباهك</h2><span>'+recommendationCount(recs.length)+'</span></header>'+(recs.length?recs.slice(0,3).map(r=>'<button type="button" class="g-opportunity" data-growth="open:'+r.id+'"><span class="g-line-icon">'+icon(recommendationIcon(r.type))+'</span><span><strong>'+E(r.title)+'</strong><small>'+E(reasonFor(r))+'</small></span><span class="g-row-action">'+E(r.actionLabel)+icon('chevron')+'</span></button>').join(''):'<p class="g-empty">'+'لا توجد توصيات إضافية حاليًا.'+'</p>')+'</section>';
  }
  function forecast() {
    const f=model.forecast, days=f.days||[], has=days.some(d=>d.estimate), selection=days.find(d=>d.date===focusDay)||days.find(d=>d.estimate)||days[0];
    const top=Math.max(4,...days.map(d=>Math.max(d.booked||0,d.estimate?.high||0))), max=Math.ceil(top/4)*4;
    const ticks=[max,max/2,0], width=660, left=40, right=630, baseline=184, height=142;
    const x=i=>left+(right-left)/14+(right-left)/7*i;
    const rows=days.map((d,i)=>{const actual=Math.max(0,d.booked||0),xv=x(i), yv=baseline-actual/max*height,hi=d.estimate?.high||0,low=d.estimate?.low||0;
      return '<g class="g-day '+(d.date===selection?.date?'is-selected':'')+'" tabindex="0" role="button" aria-label="'+E(date(d.date)+': '+number(actual)+' حجوزات مؤكدة'+(d.estimate?'، تقدير من '+number(low)+' إلى '+number(hi):'، التقدير غير متاح'))+'" data-growth="day:'+d.date+'">'+
        (d.estimate?'<rect class="g-range" x="'+(xv-22)+'" y="'+(baseline-hi/max*height)+'" width="44" height="'+Math.max(3,(hi-low)/max*height)+'" rx="6"/><path class="g-range-cap" d="M'+(xv-15)+' '+(baseline-hi/max*height)+'h30"/>':'')+
        '<rect class="g-actual" x="'+(xv-10)+'" y="'+yv+'" width="20" height="'+Math.max(2,actual/max*height)+'" rx="4"/><text x="'+xv+'" y="214" text-anchor="middle">'+E(date(d.date,{weekday:'short'}))+'</text><text class="g-day-number" x="'+xv+'" y="234" text-anchor="middle">'+number(Number(d.date.slice(-2)))+'</text></g>';
    }).join('');
    return '<section class="g-forecast g-surface"><header class="g-section-head"><div><h2>الأسبوع القادم، أقرب للوضوح</h2><p>المؤكد الآن، وما يشير إليه سجل الزيارات.</p></div>'+btn(icon('info'),'forecast-info','g-icon','aria-label="كيف نحسب التوقع؟"')+'</header><div class="g-forecast-total"><strong>'+number(model.summary.next7Booked)+'</strong><span>موعد مؤكد</span><small>خلال ٧ أيام قادمة</small></div><div class="g-chart-legend"><span><i class="g-key-actual"></i>حجوزات مؤكدة</span><span><i class="g-key-range"></i>تقدير الزيارات حسب السجل</span></div>'+
      (has||model.summary.next7Booked>0?'<svg class="g-forecast-chart" viewBox="0 0 '+width+' 248" role="group" aria-label="المؤكد والتقدير للأيام السبعة القادمة" dir="ltr">'+ticks.map(t=>'<g class="g-grid"><line x1="30" x2="644" y1="'+(baseline-t/max*height)+'" y2="'+(baseline-t/max*height)+'"/><text x="20" y="'+(baseline-t/max*height+4)+'" text-anchor="end">'+number(t)+'</text></g>').join('')+rows+'</svg>'+(!has?'<p class="g-form-note">الحجوزات مؤكدة، والتقدير ينتظر ٤ أيام مقارنة سابقة لكل يوم.</p>':''):'<div class="g-insufficient">'+icon('calendar')+'<h3>نحتاج سجلًا أطول قبل التوقع.</h3><p>نعرض الحجوزات المؤكدة الآن. يظهر التقدير عند توفر ٤ أيام مماثلة سابقة على الأقل لكل يوم.</p></div>')+
      (selection?'<div class="g-day-detail"><div><strong>'+date(selection.date)+'</strong><span>'+number(selection.booked)+' مؤكدة'+(selection.estimate?' · التقدير '+number(selection.estimate.low)+' إلى '+number(selection.estimate.high)+' زيارات':' · سجل المقارنة غير كافٍ')+'</span></div>'+btn('مراجعة اليوم '+icon('chevron'),'schedule:'+selection.date,'g-text')+'</div>':'')+'<details class="g-chart-table"><summary>عرض الأرقام ومصدر التقدير</summary><p>'+E(f.note||'تقدير وصفي من الزيارات المكتملة في أيام الأسبوع المماثلة، وليس وعدًا بحجوزات جديدة.')+'</p><div class="g-table-wrap"><table><thead><tr><th>اليوم</th><th>المؤكد</th><th>التقدير</th><th>أيام المقارنة</th></tr></thead><tbody>'+days.map(d=>'<tr><td>'+date(d.date)+'</td><td>'+number(d.booked)+'</td><td>'+(d.estimate?number(d.estimate.low)+' إلى '+number(d.estimate.high):'غير متاح')+'</td><td>'+number(d.comparableDays)+'</td></tr>').join('')+'</tbody></table></div></details></section>';
  }
  function alerts() {
    const rows=model.recommendations.filter(r=>['stock-low','checkout-unpaid','visit-unresolved'].includes(r.type)&&activeAction(r));
    return '<section class="g-alerts g-surface"><header class="g-section-head"><div><h2>تحتاج قرارًا</h2><p>تنبيهات مرتبطة بسجلات محددة.</p></div>'+icon('bell')+'</header>'+(rows.length?rows.map(r=>'<button type="button" class="g-alert" data-growth="open:'+r.id+'"><span class="g-alert-top"><strong>'+E(r.title)+'</strong><span>'+number(r.count)+'</span></span><span>'+E(reasonFor(r))+'</span><b>'+E(r.actionLabel)+' '+icon('arrow')+'</b></button>').join(''):'<div class="g-empty g-calm">'+icon('check')+'<strong>ما عندك تنبيه يحتاج تدخل الآن.</strong><p>التنبيهات تظهر عند توفر سبب واضح في السجل.</p></div>')+'</section>';
  }
  const statusText={draft:'مسودة جاهزة',approved:'بانتظار التنفيذ',monitoring:'قيد المتابعة',deferred:'مؤجلة',done:'أُنجز الإجراء'};
  function tracking() {
    const actions=Object.values(store.actions).filter(a=>a.status!=='deferred'||Date.parse(a.until)>Date.now()).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
    const visible=filter==='all'?actions:actions.filter(a=>filter==='done'?a.status==='done':a.status!=='done');
    return '<section class="g-tracking g-surface" id="growth-tracking"><header class="g-section-head"><div><h2>من القرار إلى النتيجة</h2><p>خططك محفوظة هنا. التنفيذ وقياس الأثر خطوتان مستقلتان.</p></div><div class="g-segment" role="group" aria-label="عرض المتابعة">'+[['active','الحالية'],['done','المكتملة'],['all','الكل']].map(([v,label])=>btn(label,'filter:'+v,'', 'aria-pressed="'+(filter===v)+'"')).join('')+'</div></header>'+(visible.length?'<div class="g-tracking-list">'+visible.map(a=>'<button type="button" class="g-tracking-row" data-growth="track:'+E(a.id)+'"><span class="g-tracking-status '+(a.status==='done'?'is-done':'')+'">'+icon(a.status==='done'?'check':a.status==='deferred'?'clock':'file')+'</span><span><strong>'+E(a.title)+'</strong><small>'+E(a.type==='catalog-incomplete'?'تحسين وضوح الخدمة':a.type==='retention'?'عودة العميلات':'متابعة تشغيل العيادة')+'</small></span><span class="g-status">'+statusText[a.status]+'</span>'+icon('chevron')+'</button>').join('')+'</div>':'<div class="g-tracking-empty"><span>'+icon('target')+'</span><div><strong>أول خطوة تبدأ من توصية.</strong><p>راجعي التوصية واحفظي خطتها، ثم تابعي التنفيذ والنتيجة من هنا.</p></div></div>')+'</section>';
  }
  function competitors() {
    return '<section class="g-market g-surface"><header class="g-section-head"><div><h2>فرصتك في السوق</h2><p>قارني عروضًا منشورة، وحددي ما يستحق التحسين.</p></div>'+btn(icon('plus')+' إضافة مرجع','market-add','g-text')+'</header>'+(store.competitors.length?'<div class="g-market-refs">'+store.competitors.map((c,i)=>'<button type="button" class="g-market-ref" data-growth="market:'+i+'"><span>'+icon('link')+'</span><div><strong>'+E(c.name)+'</strong><small>'+E(c.serviceName)+' · تحديث '+date(c.checked,{day:'numeric',month:'short'})+'</small></div><span>'+money(c.price)+'</span>'+icon('chevron')+'</button>').join('')+'</div>':'<div class="g-market-empty"><div><h3>ابدئي بالخدمة، ثم قارني التفاصيل.</h3><p>أضيفي رابط عرض منافس مع السعر والمدة. نحفظ مصدره وتاريخ مراجعته قبل المقارنة.</p></div>'+btn('إضافة أول مرجع '+icon('arrow'),'market-add')+'</div>')+'<p class="g-market-note">المقارنة لا تتضمن مبيعات المنافسين أو جودة نتائج العلاج.</p></section>';
  }
  function home() {
    if (typeof role!=='undefined' && role==='doctor') return oldHome();
    load(); model=D.analyze(R.state.workspace||{});model.recommendations=model.recommendations.map(scopedRecommendation);
    // Enhance the accepted dashboard in place. Its layout, widgets and data stay intact.
    const template=document.createElement('template');template.innerHTML=oldHome();
    const root=template.content, recs=model.recommendations.filter(activeAction);
    const find=type=>recs.find(rec=>rec.type===type);
    const small=(label,action)=>'<button type="button" class="dash-growth-action" data-growth="'+E(action)+'">'+E(label)+'</button>';
    const note=(title,text,action,label,tone='')=>{
      const symbol=title.includes('توقع')?'trend':title.includes('مخزون')?'box':title.includes('تحصيل')?'file':title.includes('تحسين')?'target':'info';
      return '<div class="dash-growth-note '+tone+'"><div><strong class="dash-growth-title">'+icon(symbol)+E(title)+'</strong><p>'+E(text)+'</p></div>'+small(label,action)+'</div>';
    };
    root.querySelector('.dash-heading>div')?.insertAdjacentHTML('beforeend','<small class="dash-growth-source">'+E(sourceLabel())+'</small>');
    const heading=root.querySelector('.dash-heading'), originalAction=heading?.querySelector('button');
    if(originalAction){const controls=document.createElement('div');controls.className='dash-growth-controls';originalAction.replaceWith(controls);controls.insertAdjacentHTML('beforeend',small('متابعة الإجراءات','show-tracking'));controls.append(originalAction);}
    const chart=root.querySelector('.dash-main-column>.dash-panel');
    if(R.state.workspace?.growthPreview?.scenario==='error'){
      chart?.insertAdjacentHTML('beforeend',note('تعذّر تحديث التوصيات','تبقى أرقام العيادة وخطط المتابعة متاحة.','retry-insights','إعادة المحاولة'));
      return template.innerHTML;
    }
    const retention=find('retention');
    if(retention)root.querySelector('.dash-kpi:nth-child(2)>div:first-child')?.insertAdjacentHTML('beforeend',small('متابعة '+number(retention.count)+' عميلة سابقة','open:'+retention.id));
    const quieter=find('quieter-day'), day=model.forecast.days.find(d=>d.date===quieter?.evidence.date)||model.forecast.days.find(d=>d.estimate);
    const booked=day?.booked===1?'موعد واحد مؤكد':day?.booked===2?'موعدان مؤكدان':number(day?.booked)+(day?.booked<=10?' مواعيد مؤكدة':' موعدًا مؤكدًا');
    const outlook=day?.estimate?date(day.date,{weekday:'long',day:'numeric',month:'short'})+': '+booked+'. المتوقع من السجل: '+number(day.estimate.low)+' إلى '+number(day.estimate.high)+' زيارات.':number(model.summary.next7Booked)+' حجوزات مؤكدة للأسبوع القادم. نحتاج سجلًا أطول لتقدير الزيارات.';
    chart?.insertAdjacentHTML('beforeend',note('توقع الأسبوع القادم',outlook,'forecast-summary','تفاصيل التوقع'));
    const panels=root.querySelectorAll('.dash-secondary-grid>.dash-panel');
    const unpaid=find('checkout-unpaid');
    if(unpaid)panels[0]?.insertAdjacentHTML('beforeend',note('مبلغ بانتظار التحصيل',money(model.summary.unpaidCheckoutAmount)+' متبقية على '+(unpaid.count===1?'زيارة واحدة.':number(unpaid.count)+' زيارات.')+' راجعي الزيارة لإتمام التحصيل.','open:'+unpaid.id,'راجعي التحصيل','dash-growth-warning'));
    const catalog=find('catalog-incomplete');
    if(catalog)panels[1]?.insertAdjacentHTML('beforeend',note('توصية لتحسين عرض الخدمات',catalog.count===1?'خدمة منشورة ينقصها وصف أو بيانات أساسية.':number(catalog.count)+' خدمات منشورة تحتاج استكمال بياناتها.','open:'+catalog.id,'راجعي البيانات'));
    panels[1]?.insertAdjacentHTML('beforeend','<div class="dash-growth-links">'+small('مقارنة العروض المنشورة','market-overview')+'</div>');
    const upcoming=root.querySelector('.dash-aside>.dash-panel');
    const stock=find('stock-low'), unresolved=find('visit-unresolved');
    if(stock)upcoming?.insertAdjacentHTML('beforeend',note('تنبيه المخزون',(stock.count===1?'مادة واحدة وصلت':stock.count===2?'مادتان وصلتا':number(stock.count)+' مواد وصلت')+' إلى حد التنبيه. راجعي الكميات المتاحة.','open:'+stock.id,'عرض المواد'));
    if(unresolved)upcoming?.insertAdjacentHTML('beforeend',note('زيارة تحتاج مراجعة','موعد سابق ما زالت حالة زيارته معلّقة. افتحيه وحددي الحالة.','open:'+unresolved.id,'راجعي الزيارة'));
    if(!storageOK)heading?.insertAdjacentHTML('afterend','<p class="dash-growth-storage" role="alert">تعذّر حفظ الخطط في المتصفح. التغييرات متاحة لهذه الجلسة فقط.</p>');
    return template.innerHTML;
  }
  function openTracking(){open('متابعة الإجراءات',tracking(),btn('إغلاق','close','g-primary'));}
  function forecastSummary(){
    const rows=model.forecast.days||[];
    open('توقع الأسبوع القادم','<p class="g-help">الحجوزات مؤكدة من السجل. نطاق الزيارات تقدير وصفي من الأيام المماثلة المكتملة، وقد يختلف الواقع عنه.</p><div class="g-table-wrap"><table class="dash-growth-forecast-table"><thead><tr><th>اليوم</th><th>المؤكد</th><th>تقدير الزيارات</th></tr></thead><tbody>'+rows.map(day=>'<tr><td>'+date(day.date,{weekday:'short',day:'numeric',month:'short'})+'</td><td>'+number(day.booked)+'</td><td>'+(day.estimate?number(day.estimate.low)+' إلى '+number(day.estimate.high):'السجل غير كافٍ')+'</td></tr>').join('')+'</tbody></table></div><p class="g-form-note">'+E(model.forecast.note)+'</p>',btn('مصدر التقدير','forecast-info')+btn('إغلاق','close','g-primary'));
  }
  function render(focus) { B.render(); if(focus)requestAnimationFrame(()=>document.querySelector(focus)?.focus()); }
  function open(title, body, footer='') {
    opener=document.activeElement; const el=document.querySelector('#dialog');
    el.classList.add('g-dialog');el.innerHTML='<div class="g-dialog-head"><div><span>كلينيمي · خطوة للتحسين</span><h2 id="g-dialog-title">'+E(title)+'</h2></div>'+btn(icon('close'),'close','g-icon','aria-label="إغلاق"')+'</div><div class="g-dialog-body">'+(!storageOK?'<p class="g-storage-error" role="alert">التغييرات متاحة لهذه الجلسة فقط. تعذّر حفظها في المتصفح.</p>':'')+body+'</div>'+(footer?'<footer class="g-dialog-footer">'+footer+'</footer>':'');
    el.setAttribute('aria-labelledby','g-dialog-title');if(!el.open)el.showModal();
    requestAnimationFrame(()=>el.querySelector('input:not([type=checkbox]),textarea,select,button')?.focus());
  }
  function close() { const el=document.querySelector('#dialog');el.close();el.classList.remove('g-dialog');el.removeAttribute('aria-labelledby');opener?.focus(); }
  function getRec(id) { return store.actions[id]?.recommendation||model.recommendations.find(r=>r.id===id); }
  function targets(rec) { const w=R.state.workspace||{};return (rec.targetIds||[]).map(id=>rec.type==='catalog-incomplete'?(w.catalog||[]).find(x=>x.id===id):rec.type==='stock-low'?Object.values(w.stock||{}).find(x=>x.id===id):(w.bookings||[]).find(x=>x.id===id)).filter(Boolean); }
  function titleFor(value) { return value?.nameAr||value?.nameEn||value?.name||value?.contact?.name||value?.attendee?.name||'سجل العيادة'; }
  function targetTable(rec) {
    const rows=targets(rec);
    return '<div class="g-target-list">'+rows.slice(0,12).map((r,i)=>'<div><span>'+E(titleFor(r))+'</span><small>'+E(rec.type==='stock-low'?'المتوفر '+number(r.quantity)+' · حد التنبيه '+number(r.min):rec.type==='catalog-incomplete'?'راجعي وصف الخدمة والمدة والسعر':rec.type==='checkout-unpaid'&&Number.isFinite(R.state.workspace.visits?.[r.id]?.balance)?'المتبقي '+money(R.state.workspace.visits[r.id].balance):date(r.date,{day:'numeric',month:'short'})+' · '+(r.time||''))+'</small></div>').join('')+(rows.length>12?'<p>و'+number(rows.length-12)+' سجلات أخرى ضمن الخطة</p>':'')+'</div>';
  }
  function why(rec) {
    const evidence=Object.entries(rec.evidence||{}).filter(([k,v])=>typeof v==='number'||typeof v==='string').map(([k,v])=>[k,v]);
    open('سبب التوصية','<div class="g-reason"><h3>'+E(rec.title)+'</h3><p>'+E(reasonFor(rec))+'</p></div><dl class="g-facts"><div><dt>المصدر</dt><dd>سجلات العيادة المحمّلة</dd></div><div><dt>السجلات المعنية</dt><dd>'+number(rec.count)+'</dd></div><div><dt>آخر قراءة</dt><dd>'+date(model.asOf)+'</dd></div></dl><p class="g-help">هذه ملاحظة من السجل، وليست توقعًا مؤكدًا لسلوك العميلات. يمكنك مراجعة التفاصيل قبل اعتماد أي إجراء.</p>',btn('مراجعة الإجراء '+icon('arrow'),'open:'+rec.id,'g-primary'));
  }
  function defaultMessage() { return 'أهلًا من كلينيمي،\nيسعدنا نشوفك من جديد. اختاري موعدًا يناسبك من صفحة الحجز، وخذي وقتك للعناية بنفسك.\nننتظرك بكل حب.'; }
  function review(id) {
    const rec=getRec(id);if(!rec)return;current=rec;
    const saved=planBuffer?.id===id?planBuffer:store.actions[id], outreach=['retention','quieter-day'].includes(rec.type);planBuffer=null;
    const details='<div class="g-review-intro"><span class="g-step">١ · مراجعة السبب والخطة</span><p>'+E(reasonFor(rec))+'</p></div>';
    const body=outreach?details+'<form id="g-plan-form"><label>اسم الخطة<input name="title" required maxlength="120" value="'+E(saved?.title||rec.title)+'"></label><div class="g-audience"><span>'+icon('people')+' الجمهور المقترح</span><strong>'+number(rec.count)+' '+(rec.type==='retention'?'عميلة':'مواعيد مؤكدة لليوم')+'</strong><p>'+(rec.type==='retention'?'صاحبات زيارات مكتملة سابقة، بدون حجز قادم. راجعي موافقات التسويق قبل أي إرسال.':'راجعي اليوم والخدمة والجمهور المناسب قبل تجهيز الدعوة.')+'</p><details class="g-audience-details"><summary>عرض الجمهور المقترح</summary>'+targetTable(rec)+'</details></div><label>نص الدعوة<textarea name="message" rows="5" maxlength="2000" required>'+E(saved?.message||defaultMessage(rec))+'</textarea></label><div class="g-form-grid"><label>موعد المتابعة<input type="date" name="due" min="'+model.today+'" value="'+E(saved?.due||model.forecast.days[2]?.date||model.today)+'" required></label><label>القناة<select name="channel"><option value="email" '+(saved?.channel==='email'?'selected':'')+'>البريد الإلكتروني</option><option value="whatsapp" '+(saved?.channel==='whatsapp'?'selected':'')+'>واتساب</option></select></label></div><p class="g-form-note">حفظ الخطة لا يرسل الدعوة. الإرسال يحتاج ربط القناة ومراجعة موافقات العميلات.</p></form>':details+targetTable(rec)+'<details class="g-audience-details"><summary>ملاحظة وموعد للمتابعة</summary><form id="g-plan-form"><label>عنوان الإجراء<input name="title" required maxlength="120" value="'+E(saved?.title||rec.title)+'"></label><label>ملاحظات التنفيذ<textarea name="message" rows="3" maxlength="2000" placeholder="ما الذي ستراجعينه؟">'+E(saved?.message||'')+'</textarea></label><label>موعد المتابعة<input type="date" name="due" min="'+model.today+'" value="'+E(saved?.due||model.today)+'" required></label></form></details>';
    const recordAction=({'stock-low':'فتح المخزون','catalog-incomplete':'فتح صفحة الخدمة','checkout-unpaid':'فتح الزيارة','visit-unresolved':'فتح الزيارة'})[rec.type]||'مراجعة السجل';open(rec.title,body,outreach?btn('تأجيل ليوم','defer:'+id,'g-text')+btn('حفظ مسودة','save-draft')+btn('مراجعة الاعتماد '+icon('arrow'),'approve-review','g-primary'):btn('تأجيل ليوم','defer:'+id,'g-text')+btn('حفظ للمتابعة','save-operational')+btn(recordAction+' '+icon('arrow'),'records:'+id,'g-primary'));
  }
  function readForm() {const form=document.querySelector('#g-plan-form');if(!form?.reportValidity())return null;return Object.fromEntries(new FormData(form));}
  function saveDraft() {const values=readForm();if(!values)return;const rec=current;store.actions[rec.id]={...store.actions[rec.id],...values,id:rec.id,type:rec.type,status:'draft',recommendation:rec,updatedAt:new Date().toISOString()};const ok=saveLocal();close();render();notice(ok?'حُفظت المسودة. تقدرين ترجعين وتكملينها من المتابعة.':'المسودة متاحة في هذه الجلسة فقط؛ تعذّر الحفظ الدائم.');}
  function approval() { const values=readForm();if(!values)return;current={...current,form:values};open('راجعي خطتك قبل الاعتماد','<span class="g-step">٢ · اعتماد الخطة</span><h3>'+E(values.title)+'</h3><dl class="g-facts"><div><dt>نوع الإجراء</dt><dd>'+E(['retention','quieter-day'].includes(current.type)?'خطة تواصل':'مراجعة تشغيلية')+'</dd></div><div><dt>السجلات المعنية</dt><dd>'+number(current.count)+'</dd></div><div><dt>موعد المتابعة</dt><dd>'+date(values.due)+'</dd></div></dl>'+(values.message?'<blockquote class="g-message-preview">'+E(values.message).replaceAll('\n','<br>')+'</blockquote>':'')+'<p class="g-help">سيُحفظ الإجراء في المتابعة بحالة «بانتظار التنفيذ». لن نغيّر موعدًا أو نرسل رسالة أو نضيف خصمًا.</p>',btn('تعديل الخطة','back-plan')+btn('اعتماد الخطة '+icon('check'),'confirm-plan','g-primary')); }
  function confirm() { const rec=current,{form,...recommendation}=rec;store.actions[rec.id]={...store.actions[rec.id],...form,id:rec.id,type:rec.type,status:'approved',recommendation,baseline:{asOf:model.asOf,count:rec.count},updatedAt:new Date().toISOString()};const ok=saveLocal();close();render();notice(ok?'اعتُمدت الخطة. افتحيها من المتابعة عند بدء التنفيذ.':'اعتُمدت الخطة لهذه الجلسة؛ تعذّر حفظها في المتصفح.');}
  function track(id) {
    const a=store.actions[id];if(!a)return;current=a.recommendation;
    const done=a.status==='done', monitoring=a.status==='monitoring';
    open(a.title,'<div class="g-track-header"><span class="g-status">'+statusText[a.status]+'</span><span>متابعة '+date(a.due||a.updatedAt)+'</span></div><ol class="g-steps"><li class="is-done">الخطة محفوظة</li><li class="'+(monitoring||done?'is-done':'')+'">تنفيذ الإجراء</li><li class="'+(done?'is-done':'')+'">متابعة النتيجة</li></ol>'+(a.message?'<blockquote class="g-message-preview">'+E(a.message).replaceAll('\n','<br>')+'</blockquote>':'')+'<div class="g-outcome"><h3>'+(done?'ما الذي تغيّر؟':monitoring?'انتظري بيانات قبل الحكم على الأثر.':'الإجراء جاهز للمراجعة والتنفيذ.')+'</h3><p>'+(done?E(a.outcome||'أُنجزت الخطوة. لا توجد نتيجة مالية مثبتة لهذا الإجراء.'):monitoring?'نسجّل التنفيذ بشكل مستقل. ما عندنا ربط يثبت أن أي حجز جديد جاء بسبب هذه الخطة.':'مراجعة السجل تفتح الصفحة الأصلية. لا يتغير السجل بمجرد الضغط.')+'</p></div>'+
      (['draft','deferred','done'].includes(a.status)?'':'<label>ملاحظة المتابعة<textarea id="g-outcome-note" rows="3" maxlength="1000" placeholder="مثال: اكتمل تحديث وصف الخدمة، وسنراجع الحجوزات الأسبوع القادم.">'+E(a.outcome||'')+'</textarea></label>'),
      btn('إغلاق','close')+(done?btn('إعادة فتح المتابعة','reopen:'+id):a.status==='draft'?btn('إكمال المسودة','open:'+id,'g-primary'):a.status==='deferred'?btn('إعادة التوصية','restore:'+id,'g-primary'):btn('مراجعة السجلات','records:'+id)+(monitoring?btn('حفظ المراجعة وإنهاء الإجراء','finish:'+id,'g-primary'):btn('سجّلي بدء التنفيذ','begin:'+id,'g-primary'))));
  }
  function records(rec) {
    if(rec.type==='catalog-incomplete'){const id=targets(rec)[0]?.id,index=(R.state.workspace.catalog||[]).findIndex(x=>x.id===id);if(index<0)return open('السجل لم يعد متاحًا','<p>الخدمة المرتبطة بهذه الخطة لم تعد في الكتالوج. راجعي الخطة قبل اختيار خدمة أخرى.</p>',btn('رجوع للخطة','track:'+rec.id,'g-primary'));close();location.hash='service/'+index;return;}
    if(rec.type==='stock-low'){close();location.hash='supplies';return;}
    const target=targets(rec)[0];if(target&&['checkout-unpaid','visit-unresolved'].includes(rec.type)){close();location.hash='appointment/'+encodeURIComponent(target.id);return;}
    open('السجلات المرتبطة بالخطة',targetTable(rec)+'<p class="g-help">هذه مراجعة للسجل. لا تتضمن إرسال رسائل أو تغيير المواعيد.</p>',btn('رجوع للخطة','track:'+rec.id,'g-primary'));
  }
  function schedule(day) {
    const rows=(R.state.workspace.bookings||[]).filter(x=>x.date===day&&x.status!=='cancelled');
    const rec=model.recommendations.find(r=>r.type==='quieter-day'&&r.evidence.date===day);
    open('مواعيد '+date(day),rows.length?'<div class="g-target-list">'+rows.map(r=>'<a href="#appointment/'+E(r.id)+'" data-growth="navigate"><span>'+E(titleFor(r))+'</span><small>'+E(r.time)+' · '+E((r.items||[]).map(x=>x.nameAr).join('، '))+'</small>'+icon('chevron')+'</a>').join('')+'</div>':'<div class="g-empty"><h3>لا توجد مواعيد مؤكدة لهذا اليوم.</h3><p>راجعي جدول الفريق للتحقق من الأوقات المتاحة.</p></div>',btn('فتح التقويم','calendar:'+day)+(rec?btn('جهّزي خطة لليوم','plan:'+rec.id,'g-primary'):btn('إغلاق','close','g-primary')));
  }
  function marketAdd() {open('إضافة مرجع للمقارنة','<p class="g-help">أدخلي عرضًا منشورًا راجعتِه. نحفظ المعلومات كما تكتبينها، دون جلب بيانات من الرابط.</p><form id="g-market-form"><label>اسم المنافس<input name="name" maxlength="80" required></label><label>رابط العرض<input type="url" name="url" placeholder="https://" dir="ltr" required></label><label>خدمة كلينيمي المقابلة<select name="service" required>'+R.state.workspace.catalog.filter(x=>x.active!==false&&!(x.options||[]).length).map(s=>'<option value="'+E(s.id)+'">'+E(s.nameAr)+'</option>').join('')+'</select></label><div class="g-form-grid"><label>سعر عرض المنافس بالريال<input name="price" type="number" min="0" max="100000" step="0.01" required></label><label>مدة الخدمة بالدقائق<input name="duration" type="number" min="1" max="1440" required></label></div><label>تاريخ التحقق<input name="checked" type="date" value="'+model.today+'" max="'+model.today+'" required></label><label>ما الذي يشمله العرض؟<textarea name="includes" maxlength="600" rows="3" required></textarea></label></form>',btn('إلغاء','close')+btn('حفظ المرجع','market-save','g-primary'));}
  function saveMarket() {const form=document.querySelector('#g-market-form');if(!form?.reportValidity())return;const v=Object.fromEntries(new FormData(form));let url;try{url=new URL(v.url);if(!['http:','https:'].includes(url.protocol))throw Error();}catch{return form.elements.url.setCustomValidity('أدخلي رابطًا يبدأ بـ https:// أو http://'),form.elements.url.reportValidity();}form.elements.url.setCustomValidity('');const service=R.state.workspace.catalog.find(s=>s.id===v.service);store.competitors.unshift({...v,url:url.href,price:Number(v.price),duration:Number(v.duration),serviceName:service?.nameAr||''});saveLocal();close();render();marketView(0);}
  function marketView(index) {
    const c=store.competitors[index];if(!c)return;
    const own=(R.state.workspace.catalog||[]).find(s=>s.id===c.service),available=own&&own.active!==false,optionless=!(own?.options||[]).length;
    const ownPrice=optionless&&Number.isFinite(own?.discount)?own.discount:own?.price;
    const comparable=available&&optionless&&Number(own.duration)===c.duration;
    const ownValue=!available?'الخدمة غير متاحة':!optionless?'تحتاج تحديد خيار':Number.isFinite(ownPrice)?money(ownPrice):'السعر غير معتمد';
    let source;try{const url=new URL(c.url);source=['http:','https:'].includes(url.protocol)?url.href:null;}catch{source=null;}
    open('مراجعة العرض المنشور','<span class="g-step">مرجع أُضيف يدويًا · '+date(c.checked)+'</span><h3>'+E(c.serviceName)+'</h3><div class="g-compare"><div><span>كلينيمي</span><strong>'+E(ownValue)+'</strong><small>'+(available?number(own.duration)+' دقيقة':'راجعي الكتالوج الحالي')+'</small></div><div><span>'+E(c.name)+'</span><strong>'+money(c.price)+'</strong><small>'+number(c.duration)+' دقيقة</small></div></div><p>'+E(c.includes)+'</p><p class="g-help">'+(!available?'الخدمة المرتبطة بهذا المرجع لم تعد متاحة. أضيفي مرجعًا لخدمة حالية قبل المقارنة.':!optionless?'الخدمة أصبحت تضم خيارات بأسعار ومدد مختلفة. أعيدي تحديد الخدمة المقابلة قبل المقارنة.':comparable?'المدة متطابقة. راجعي ما يشمله العرض وجودة التجربة قبل اتخاذ قرار بالسعر.':'المدتان مختلفتان. راجعي محتوى كل عرض قبل مقارنة السعر.')+'</p>'+(source?'<a class="g-source-link" href="'+E(source)+'" target="_blank" rel="noopener noreferrer">فتح المصدر '+icon('link')+'</a>':''),btn('حذف المرجع','market-remove:'+index)+(available?btn('مراجعة صفحة خدمتي','market-service:'+index,'g-primary'):btn('إغلاق','close','g-primary')));
  }
  async function act(action) {
    const [type,...parts]=action.split(':'),id=parts.join(':');
    if(type==='close')return close();
    if(type==='open'){const rec=getRec(id);if(rec?.type==='quieter-day')return schedule(rec.evidence.date);return review(id);}
    if(type==='plan')return review(id);
    if(type==='why')return why(getRec(id));
    if(type==='save-draft')return saveDraft();
    if(type==='save-operational'){const values=readForm();if(!values)return;current={...current,form:values};return confirm();}
    if(type==='approve-review')return approval();
    if(type==='confirm-plan')return confirm();
    if(type==='back-plan'){planBuffer={id:current.id,...current.form};return review(current.id);}
    if(type==='defer'){const rec=getRec(id);if(!rec)return;store.actions[id]={id,type:rec.type,title:rec.title,status:'deferred',recommendation:rec,until:new Date(Date.now()+86400000).toISOString(),updatedAt:new Date().toISOString()};saveLocal();close();render();return notice('أُجّلت التوصية ليوم. تقدرين ترجعينها من المتابعة.');}
    if(type==='restore'){delete store.actions[id];saveLocal();close();return render();}
    if(type==='track')return track(id);
    if(type==='filter'){filter=id;return openTracking();}
    if(type==='show-tracking')return openTracking();
    if(type==='forecast-summary')return forecastSummary();
    if(type==='market-overview')return open('مقارنة العروض المنشورة',competitors(),btn('إغلاق','close','g-primary'));
    if(type==='retry-insights'){location.href='/__local/scenario?value=ready';return;}
    if(type==='begin'||type==='finish'||type==='reopen'){
      const a=store.actions[id];if(!a)return;a.status=type==='finish'?'done':'monitoring';a.outcome=document.querySelector('#g-outcome-note')?.value||a.outcome||'';a.updatedAt=new Date().toISOString();if(type==='begin')a.startedAt=a.updatedAt;saveLocal();close();render();return track(id);
    }
    if(type==='records')return records(getRec(id));
    if(type==='day'){focusDay=id;render('[data-growth="day:'+id+'"]');return;}
    if(type==='schedule')return schedule(id);
    if(type==='navigate')return close();
    if(type==='calendar'){close();if(typeof selectedDate!=='undefined')selectedDate=id;location.hash='appointments';return;}
    if(type==='market-add')return marketAdd();
    if(type==='market-save')return saveMarket();
    if(type==='market')return marketView(Number(id));
    if(type==='market-remove'){store.competitors.splice(Number(id),1);saveLocal();close();render();return;}
    if(type==='market-service'){const c=store.competitors[Number(id)],i=(R.state.workspace.catalog||[]).findIndex(s=>s.id===c?.service);if(i<0)return notice('الخدمة المرتبطة لم تعد في الكتالوج. أضيفي مرجعًا لخدمة متاحة.');close();location.hash='service/'+i;return;}
    if(type==='forecast-info')return open('كيف نحسب تقدير الأسبوع؟','<h3>مقارنة وصفية بالأيام المماثلة.</h3><p>نقارن كل يوم بالزيارات المكتملة في نفس يوم الأسبوع خلال السجل السابق. نحتاج ٤ أيام مقارنة على الأقل لكل تقدير، ونستبعد الإلغاءات والبيانات المستقبلية.</p><p>النطاق يوضح التفاوت التاريخي. الحجوزات المؤكدة معروضة بشكل مستقل، ولا يتحول التقدير إلى إيراد متوقع أو نسبة ثقة مصطنعة.</p><dl class="g-facts"><div><dt>بداية السجل المتاح</dt><dd>'+date(model.source.coverageStart)+'</dd></div><div><dt>أيام السجل</dt><dd>'+number(model.source.historyDays)+'</dd></div></dl><p class="g-help">وجود سجل لا يثبت اكتمال التغطية لكل يوم. التقدير يحتاج مراجعة بعد الإجازات أو تغيّر الفريق وساعات العمل.</p>',btn('فهمت','close','g-primary'));
    if(type==='sources')return open('البيانات التي نقرأها','<dl class="g-facts"><div><dt>الحجوزات والزيارات</dt><dd>من سجل العيادة</dd></div><div><dt>الكتالوج والمخزون</dt><dd>من مساحة الفريق</dd></div><div><dt>نتائج الحملات</dt><dd>غير مربوطة</dd></div><div><dt>مراجع المنافسين</dt><dd>تُضاف يدويًا مع مصدرها</dd></div><div><dt>حفظ الخطط</dt><dd>على هذا المتصفح في المعاينة</dd></div></dl><p class="g-help">المعاينة لا تشغّل حملات ولا ترسل رسائل للعميلات. «بدء التنفيذ» سجل متابعة يدوي، وليس تأكيدًا من مزوّد خارجي.</p>',btn('إغلاق','close','g-primary'));
  }
  document.addEventListener('click',event=>{const el=event.target.closest('[data-growth]');if(!el||el.disabled)return;const action=el.dataset.growth;if(action!=='navigate')event.preventDefault();try{act(action).catch(()=>notice('تعذّر تنفيذ الخطوة. بياناتك الحالية محفوظة أثناء الجلسة.'));}catch{notice('تعذّر تنفيذ الخطوة. حاولي مرة أخرى.');}});
  document.addEventListener('input',event=>{if(event.target.matches('#g-market-form [name=url]'))event.target.setCustomValidity('');});
  document.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key)||event.target.tagName.toLowerCase()!=='g')return;const el=event.target.closest('[data-growth]');if(el){event.preventDefault();act(el.dataset.growth);}});
  document.querySelector('#dialog').addEventListener('close',()=>{const dialog=document.querySelector('#dialog');if(!dialog.open){dialog.classList.remove('g-dialog');dialog.removeAttribute('aria-labelledby');}});
  B.onClear(()=>{owner='';store={version:1,actions:{},competitors:[]};model=null;current=null;});
  window.home=home;window.StaffGrowth={home};
})();
