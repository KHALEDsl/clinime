/* The ad account is not connected. Only the report explicitly labelled as a sample uses these figures. */
(() => {
  'use strict';
  const R = window.StaffRuntime, B = window.StaffBridge, S = R.state, E = R.E;
  const months = {
    nov: { name: 'نوفمبر ٢٠٢٦', range: '١–٤ نوفمبر', budget: 6000, spend: [280,320,480,360], bookings: [3,5,4,6], ticks: ['١ نوفمبر','٢ نوفمبر','٣ نوفمبر','٤ نوفمبر'], campaign: 'موعد للعناية بالبشرة', visits: 12, revenue: 3000 },
    oct: { name: 'أكتوبر ٢٠٢٦', range: '١–٣١ أكتوبر', budget: 8000, spend: [820,1450,1120,1640], bookings: [7,14,11,18], ticks: ['١–٧ أكتوبر','٨–١٤ أكتوبر','١٥–٢١ أكتوبر','٢٢–٣١ أكتوبر'], campaign: 'جلسات العناية بالخريف', visits: 37, revenue: 9250 }
  };
  let period = 'nov', metric = 'bookings', data = null, owner = '', read = 0, busy = false, error = '', loadedAt = 0;
  const num = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Riyadh'});
  const fmt = value => Number.isFinite(value) ? num.format(value) : '—';
  const when = value => value && Number.isFinite(Date.parse(value)) ? date.format(new Date(value)) : '—';
  const money = value => value == null ? 'غير محدد' : fmt(value) + ' ر.س';
  const sum = values => values.reduce((total,value) => total + value,0);
  const active = () => /^(#marketing(?:\/|$)|#loyalty(?:\/|$))/.test(location.hash);
  const account = () => String(S.user?.id || S.user?.email || '');
  const title = (name, text, control = '') => '<header class="pagehead mkt-title"><div><h1>'+name+'</h1><p>'+text+'</p></div>'+control+'</header>';
  const panel = (heading, detail, body, side = '') => '<section class="mkt-panel"><div class="mkt-panelhead"><div><h2>'+heading+'</h2>'+(detail?'<p>'+detail+'</p>':'')+'</div>'+side+'</div>'+body+'</section>';
  const empty = (text) => '<p class="mkt-empty">'+text+'</p>';
  const table = (caption, headers, rows) => '<div class="mkt-scroll"><table class="mkt-table"><caption class="mkt-sr">'+caption+'</caption><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  function chart(report) {
    const spend=metric==='spend',values=report[metric],max=Math.ceil(Math.max(...values,1)/(spend?250:5))*(spend?250:5);
    const baseline=178, xs=values.map((_,i)=>64+440*i/(values.length-1)),ys=values.map(v=>baseline-130*v/max);
    const axes=[0,max/2,max].map(v=>{const y=baseline-130*v/max;return '<line x1="42" x2="535" y1="'+y+'" y2="'+y+'"/><text x="30" y="'+(y+4)+'" text-anchor="end">'+fmt(v)+'</text>'}).join('');
    return '<figure class="mkt-chart"><div class="mkt-chart-total"><strong>'+fmt(sum(values))+'</strong><span>'+(spend?'ريال مصروف':'حجزًا من الحملة')+'</span><small>'+report.range+'</small></div><svg dir="ltr" viewBox="0 0 575 218" role="img" aria-label="'+(spend?'المصروف بالريال':'الحجوزات المنسوبة للحملة')+'"><g class="mkt-axes">'+axes+'</g>'+
      values.map((v,i)=>'<g tabindex="0" class="mkt-column" role="img" aria-label="'+report.ticks[i]+'، '+(spend?money(v):fmt(v)+' حجوزات')+'"><rect x="'+(xs[i]-23)+'" y="'+ys[i]+'" width="46" height="'+(baseline-ys[i])+'" rx="8" class="'+(i===values.length-1?'is-current':'')+'"/><text class="mkt-column-value" x="'+xs[i]+'" y="'+(ys[i]-10)+'" text-anchor="middle">'+fmt(v)+'</text><text class="mkt-tick" x="'+xs[i]+'" y="204" text-anchor="middle">'+report.ticks[i]+'</text><title>'+report.ticks[i]+' · '+(spend?money(v):fmt(v))+'</title></g>').join('')+'</svg><figcaption><details><summary>عرض قيم الرسم</summary>'+table('قيم أداء الحملات',['الفترة',spend?'المصروف':'الحجوزات'],values.map((v,i)=>[report.ticks[i],spend?money(v):fmt(v)]))+'</details></figcaption></figure>';
  }
  function overview() {
    if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname))return title('التسويق','الميزانية ونتائج الحملات.')+panel('بيانات الحملات','',empty('لم يُربط حساب الإعلانات بعد. تظهر نتائج الحملات هنا بعد الربط.'));
    const report=months[period],spent=sum(report.spend),bookings=sum(report.bookings),remaining=report.budget-spent,used=Math.round(100*spent/report.budget);
    const select='<label class="mkt-filter"><span>فترة التقرير</span><select id="mkt-period">'+Object.entries(months).map(([key,v])=>'<option value="'+key+'" '+(key===period?'selected':'')+'>'+v.name+'</option>').join('')+'</select></label>';
    const metricSwitch='<div class="mkt-switch" role="group" aria-label="مؤشر الرسم">'+[['bookings','الحجوزات'],['spend','المصروف']].map(([key,label])=>'<button type="button" data-mkt-metric="'+key+'" aria-pressed="'+(key===metric)+'">'+label+'</button>').join('')+'</div>';
    const metricCard=(label,value,unit,cls)=>'<section class="mkt-metric '+cls+'"><span>'+label+'</span><strong>'+fmt(value)+' <small>'+unit+'</small></strong></section>';
    const cost=spent/bookings;
    return '<div class="mkt-overview">'+title('نظرة على التسويق','الحملات، الميزانية، وما عاد منها إلى العيادة.',select)+
      '<p class="mkt-source">تقرير توضيحي محلي · حساب الإعلانات لم يُربط بعد</p>'+
      '<div class="mkt-metrics">'+metricCard('ميزانية الفترة',report.budget,'ر.س','is-blue')+metricCard('المصروف',spent,'ر.س','is-pink')+metricCard('المتبقي',remaining,'ر.س','')+metricCard('الحجوزات المنسوبة',bookings,'حجزًا','')+'</div>'+
      '<div class="mkt-overview-grid"><div class="mkt-overview-main">'+panel('أداء الحملة','الحجوزات والمصروف خلال الفترة',chart(report),metricSwitch)+
      '<section class="mkt-conversion"><header><div><h2>من الزيارة إلى الحجز</h2><p>متابعة النتيجة بدل الاكتفاء بالصرف</p></div><span>بيانات توضيحية</span></header><div>'+[['من رابط الحملة',bookings,'#2d3e5b'],['أتممن الزيارة',report.visits,'#b6cbd9']].map(([label,value,color])=>'<div><span>'+label+'</span><div><i style="width:'+Math.round(value/bookings*100)+'%;background:'+color+'"></i></div><strong>'+fmt(value)+'</strong></div>').join('')+'</div><p>'+fmt(Math.round(report.visits/bookings*100))+'٪ من الحجوزات وصلت لزيارة مكتملة</p></section></div>'+
      '<aside class="mkt-overview-aside">'+panel('حالة الميزانية','من المبلغ المخطط لهذه الفترة','<div class="mkt-budget-ring" style="--spent:'+used+'%"><div><strong>'+used+'<small>٪</small></strong><span>استُخدم من الميزانية</span></div></div><dl class="mkt-mini-facts"><div><dt><i class="mkt-key-spent"></i>المصروف</dt><dd>'+money(spent)+'</dd></div><div><dt><i></i>المتبقي</dt><dd>'+money(remaining)+'</dd></div></dl>')+
      panel('نتيجة آخر حملة','إنستقرام · '+report.range,'<span class="mkt-channel">INSTAGRAM</span><h3 class="mkt-campaign">'+report.campaign+'</h3><dl class="mkt-facts"><div><dt>إيراد الزيارات المكتملة</dt><dd>'+money(report.revenue)+'</dd></div><div><dt>تكلفة الحجز المنسوب</dt><dd>'+money(Math.round(cost*100)/100)+'</dd></div><div><dt>زيارات مكتملة</dt><dd>'+fmt(report.visits)+'</dd></div></dl>')+'</aside></div></div>';
  }
  function coming() {
    return '<div class="maeen-coming-page">'+title('معين','مساعد التسويق في كلينيمي.')+
      '<section class="maeen-unavailable" aria-label="معين قيد التطوير"><div class="maeen-muted-canvas" inert aria-hidden="true"><aside><span></span><i></i><i></i><i></i><i></i><i></i></aside><div><header><b></b><i></i></header><div class="maeen-ghost-message"></div><div class="maeen-ghost-message is-reply"></div><div class="maeen-ghost-cards"><i></i><i></i><i></i></div><footer></footer></div></div><div class="maeen-coming-overlay"><div class="maeen-coming-mark">م</div><span>معين · مساعد التسويق</span><h2 lang="en" dir="ltr">Coming Soon</h2><p>نعمل على تجهيز مساحة تجمع أفكارك،<br>خدمات العيادة، ومحتوى حملاتك.</p><span class="maeen-coming-status"><i></i> قيد التطوير</span></div></section></div>';
  }
  function clear() { data=null;owner='';busy=false;error='';loadedAt=0;read++;clearTimeout(searchTimer);detail={member:null,tab:'visits',page:1};editRevision=null;referralView='referrals';Object.values(views).forEach(state=>Object.assign(state,{query:'',status:'all',page:1})); }
  B.onClear(clear);
  async function load(force=false) {
    if (!account() || busy || (!force && Date.now()-loadedAt<30000)) return;
    const who=account(), seq=++read; busy=true; error='';
    try {
      const result=await R.API.request('/api/admin/loyalty');
      if (seq!==read || who!==account()) return;
      data=result;loadedAt=Date.now();
    } catch (cause) {
      if (seq!==read || who!==account()) return;
      if ([401,403].includes(cause.status)) return R.clear(cause.status===403?'denied':'email');
      error='تعذّر تحميل بيانات البرنامج.';
    } finally {
      if (seq===read) {busy=false;if(active() && !S.dirty && !document.querySelector('#dialog')?.open) B.render();}
    }
  }
  const localPreview = ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  let source = localPreview ? 'demo' : 'clinic', currentView = 'loyalty', searchTimer;
  const views = Object.fromEntries(['loyalty','referrals','wallets'].map(key=>[key,{query:'',status:'all',sort:key==='loyalty'?'latest':'newest',page:1,size:25}]));
  const rewardNames = {available:'متاحة',active:'متاحة',gifted:'مُهداة',used:'استُخدمت',redeemed:'استُخدمت',reserved:'محجوزة',booked:'محجوزة'};
  const recordDate = value=>when(value)==='—'?'غير مسجل':when(value);
  const referralNames = {pending:'بانتظار أول زيارة',earned:'اكتملت',completed:'اكتملت',cancelled:'أُلغيت',disqualified:'غير مستحقة',awarded:'اكتملت',qualified:'مستحقة'};
  const available = reward=>['available','active'].includes(reward.status);
  const stampMembers = snapshot=>(snapshot?.customers||[]).filter(member=>member.stampCard);
  const latest = member=>(member.stampCard?.visits||[]).reduce((value,visit)=>String(visit.at||'')>value?visit.at:value,'');
  const normalize = value=>String(value??'').toLocaleLowerCase('ar').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').trim();
  const identityText = member=>[member?.name,member?.email,member?.referralCode].join(' ');
  let demonstration;
  function demoSnapshot() {
    if(demonstration)return demonstration;
    const first=['نورة','سارة','ريم','لينا','هند','أمل','عبير','مها','دانا','جود','رنا','غادة','شهد','لمى','هيا','العنود','منيرة','دلال','حنان','لطيفة','أريج','بسمة','فاطمة','مريم','نوف'];
    const last=['العتيبي','القحطاني','الشهري','الدوسري','الغامدي','الحربي','الزهراني','المالكي','السبيعي','المطيري'];
    const at = day=>new Date(Date.UTC(2026,10,4)-day*86400000).toISOString();
    const customers=Array.from({length:1250},(_,i)=>{
      const total=i%25, visits=Array.from({length:total},(_,j)=>({bookingId:'DEMO-V-'+i+'-'+j,at:at(i%90+(total-j)*9)}));
      const rewards=Array.from({length:Math.floor(total/5)},(_,j)=>({id:'DEMO-G-'+i+'-'+j,earnedAt:visits[(j+1)*5-1].at,status:['available','booked','gifted'][((i+j)%3)],receivedGift:false}));
      return {userId:'demo-'+i,name:first[i%first.length]+' '+last[Math.floor(i/first.length)%last.length],email:'customer.'+String(i+1).padStart(4,'0')+'@example.invalid',referralCode:'REF-DEMO-'+String(i+1).padStart(4,'0'),stampCard:{target:5,totalVisits:total,stamps:total?((total-1)%5)+1:0,visits,rewards},referralWallet:{balanceSar:0,entries:[]}};
    });
    const referrals=Array.from({length:1800},(_,i)=>{
      const owner=customers[(i*17)%1250],status=['earned','pending','earned','pending','cancelled','earned'][i%6];
      const row={id:'DEMO-R-'+i,referrerId:owner.userId,referredId:customers[(i*17+23)%1250].userId,status,amountSar:status==='pending'?null:30,createdAt:at(i%180),...(status==='earned'?{completedAt:at(Math.max(0,i%180-2))}:{})};
      owner.referralWallet.entries.push(row);if(status==='earned')owner.referralWallet.balanceSar+=30;return row;
    });
    demonstration={customers,referrals,referralCreditSar:30,asOf:'2026-11-04T07:00:00Z'};
    return demonstration;
  }
  const snapshot=()=>source==='demo'?demoSnapshot():data;
  const members=()=>snapshot()?.customers||[];
  const memberIndex=()=>new Map(members().map(member=>[member.userId,member]));
  const refreshButton=()=>source==='demo'?'':'<button type="button" data-mkt-refresh '+(busy?'disabled':'')+'>'+ (busy?'جارٍ التحديث…':'تحديث البيانات')+'</button>';
  const alertBox=()=>source==='clinic'&&error?'<div class="mkt-alert" role="alert">'+error+' '+refreshButton()+'</div>':'';
  const noData=()=>error?'':'<p class="mkt-empty" role="status">جارٍ تحميل بيانات العيادة…</p>';
  const statusText=(label,highlight=false)=>'<span class="mkt-record-status'+(highlight?' is-emphasis':'')+'">'+E(label)+'</span>';
  function identity(member,button=false) {
    const name=E(member?.name||member?.email||'حساب عميلة'), email=member?.name&&member?.email?'<bdi class="mkt-email">'+E(member.email)+'</bdi>':'';
    return '<div class="mkt-identity">'+(button?'<button type="button" class="mkt-name" data-mkt-member="'+E(member.userId)+'" aria-label="عرض ملف '+name+'"><strong>'+name+'</strong>'+email+'</button>':'<strong>'+name+'</strong>'+email)+'</div>';
  }
  function rewardLabel(member) {
    const list=member.stampCard?.rewards||[],count=list.filter(available).length;
    if(count)return statusText(fmt(count)+' متاحة',true);
    const booked=list.filter(r=>['booked','reserved'].includes(r.status)).length;
    if(booked)return statusText(fmt(booked)+' محجوزة');
    return statusText(list.length?(rewardNames[list[0].status]||'مسجّلة'):'لا توجد جلسة مكتسبة');
  }
  function tinyProgress(member) {
    const value=Math.min(5,Math.max(0,Number(member.stampCard?.stamps)||0));
    return '<div class="mkt-progress"><span class="mkt-progress-track" aria-hidden="true">'+Array.from({length:5},(_,i)=>'<i class="'+(i<value?'is-filled':'')+'"></i>').join('')+'</span><span><bdi>'+value+' / 5</bdi><span class="mkt-sr"> أختام البطاقة الحالية</span></span></div>';
  }
  const option=(value,label,selected)=>'<option value="'+value+'" '+(value===selected?'selected':'')+'>'+label+'</option>';
  function sourceControl() {
    return localPreview?'<label class="mkt-source-control">عرض البيانات<select id="mkt-data-source">'+option('demo','بيانات توضيحية',source)+option('clinic','بيانات العيادة',source)+'</select></label>':'';
  }
  function sourceNotice() {
    return source==='demo'?'<p class="mkt-data-note"><strong>بيانات توضيحية</strong> · 1,250 عميلة و1,800 إحالة لتجربة العرض. لا تُحفظ في سجلات العيادة.</p>':'<p class="mkt-data-note">بيانات العيادة'+(data?.asOf?' · آخر تحديث '+when(data.asOf):'')+'</p>';
  }
  function stats(items) {
    return '<dl class="mkt-summary-strip">'+items.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('')+'</dl>';
  }
  function toolbar(view) {
    const state=views[view],loyalty=view==='loyalty',wallet=view==='wallets';
    const statuses=loyalty?[['all','كل العميلات'],['available','جلسة متاحة'],['near','قرب اكتمال البطاقة'],['empty','بلا زيارات']]:wallet?[['all','كل المحافظ'],['positive','رصيد متاح'],['zero','رصيد صفر']]:[['all','كل الحالات'],['pending','بانتظار أول زيارة'],['completed','اكتملت'],['qualified','مستحقة'],['cancelled','أُلغيت أو غير مستحقة']];
    const sorts=loyalty?[['latest','آخر زيارة'],['visits','الأكثر زيارة'],['name','الاسم أ–ي']]:wallet?[['newest','آخر حركة'],['balance','الرصيد الأعلى'],['name','الاسم أ–ي']]:[['newest','الأحدث أولًا'],['oldest','الأقدم أولًا'],['amount','القيمة الأعلى']];
    return '<div class="mkt-toolbar"><label class="mkt-search">'+(view==='referrals'?'البحث في طرفي الإحالة':'البحث عن عميلة')+'<input id="mkt-search" data-mkt-search type="search" autocomplete="off" value="'+E(state.query)+'" placeholder="الاسم، البريد أو كود الإحالة"></label><label>الحالة<select data-mkt-control="status">'+statuses.map(([key,label])=>option(key,label,state.status)).join('')+'</select></label><label>الترتيب<select data-mkt-control="sort">'+sorts.map(([key,label])=>option(key,label,state.sort)).join('')+'</select></label><button type="button" data-mkt-clear>مسح البحث والفلاتر</button></div>';
  }
  // One snapshot adapter owns filtering, sorting and slicing. Replace this boundary
  // with a paged API response when the server offers query/page/total parameters.
  function selectPage(view) {
    const state=views[view],index=memberIndex(),query=normalize(state.query);
    let rows=view==='referrals'?[...(snapshot()?.referrals||[])]:view==='wallets'?members().filter(m=>m.referralWallet):stampMembers(snapshot());
    rows=rows.filter(row=>{
      const card=row.stampCard,refs=card?.rewards||[],status=state.status;
      const haystack=view==='referrals'?identityText(index.get(row.referrerId))+' '+identityText(index.get(row.referredId)):identityText(row);
      if(query&&!normalize(haystack).includes(query))return false;
      if(status==='all')return true;
      if(view==='loyalty')return status==='available'?refs.some(available):status==='near'?card.stamps===4:!card.totalVisits;
      if(view==='wallets')return status==='positive'?row.referralWallet.balanceSar>0:!row.referralWallet.balanceSar;
      if(status==='completed')return ['earned','completed','awarded'].includes(row.status);
      if(status==='cancelled')return ['cancelled','disqualified'].includes(row.status);
      return row.status===status;
    });
    const name=(a,b)=>String(a.name||a.email||'').localeCompare(String(b.name||b.email||''),'ar');
    rows.sort((a,b)=>{
      switch(state.sort){
        case 'name':return name(a,b);
        case 'visits':return b.stampCard.totalVisits-a.stampCard.totalVisits||name(a,b);
        case 'latest':return String(latest(b)).localeCompare(String(latest(a)))||name(a,b);
        case 'balance':return (b.referralWallet.balanceSar||0)-(a.referralWallet.balanceSar||0)||name(a,b);
        case 'amount':return (b.amountSar||0)-(a.amountSar||0)||String(b.createdAt).localeCompare(String(a.createdAt));
        case 'oldest':return String(a.createdAt).localeCompare(String(b.createdAt));
        default:{const stamp=m=>view==='wallets'?(m.referralWallet.entries||[]).reduce((v,r)=>String(r.createdAt||'')>v?r.createdAt:v,''):m.createdAt;return String(stamp(b)).localeCompare(String(stamp(a)))||name(a,b);}
      }
    });
    const total=rows.length,pages=Math.max(1,Math.ceil(total/state.size));state.page=Math.min(pages,Math.max(1,state.page));
    const start=(state.page-1)*state.size;
    return {rows:rows.slice(start,start+state.size),total,pages,start,index};
  }
  function paginatedResults(view) {
    const result=selectPage(view),state=views[view],{rows,index,total,pages,start}=result;
    const headers=view==='loyalty'?['العميلة','البطاقة الحالية','إجمالي الزيارات','آخر زيارة','جلسة العناية']:view==='wallets'?['العميلة','كود الإحالة','الرصيد المتاح','آخر حركة']:['صاحبة الدعوة','العميلة المدعوّة','الحالة','قيمة الإحالة','تاريخ الإحالة'];
    const rowCells=row=>view==='loyalty'?[identity(row,true),tinyProgress(row),fmt(row.stampCard.totalVisits),latest(row)?recordDate(latest(row)):'لم تُسجّل زيارة',rewardLabel(row)]:view==='wallets'?[identity(row,true),'<bdi class="mkt-code">'+E(row.referralCode||'غير مسجل')+'</bdi>',money(row.referralWallet.balanceSar),recordDate((row.referralWallet.entries||[]).reduce((v,r)=>String(r.createdAt||'')>v?r.createdAt:v,''))]:[identity(index.get(row.referrerId),Boolean(index.get(row.referrerId))),identity(index.get(row.referredId),Boolean(index.get(row.referredId))),statusText(referralNames[row.status]||'مسجّلة',['earned','completed','awarded'].includes(row.status)),money(row.amountSar),recordDate(row.createdAt)];
    const label=view==='loyalty'?'بطاقات الولاء':view==='wallets'?'محافظ الإحالات':'سجل الإحالات';
    const content=rows.length?table(label,headers,rows.map(rowCells)).replace('<div class="mkt-scroll">','<div class="mkt-scroll" role="region" aria-label="'+label+'، جدول قابل للتمرير" tabindex="0">'):'<div class="mkt-no-results"><h3>'+(state.query||state.status!=='all'?'لا توجد نتائج مطابقة':'لا توجد سجلات بعد')+'</h3><p>'+(state.query||state.status!=='all'?'جرّبي اسمًا أو بريدًا آخر، أو امسحي الفلاتر.':view==='loyalty'?'تظهر بطاقات العميلات عند تفعيل البرنامج.':'تظهر الإحالات هنا عند استخدام كود الدعوة.')+'</p>'+(state.query||state.status!=='all'?'<button type="button" data-mkt-clear>مسح البحث والفلاتر</button>':'')+'</div>';
    return content+'<div class="mkt-pagination"><span id="mkt-result-count" tabindex="-1" role="status" aria-live="polite">'+(total?'عرض '+fmt(start+1)+' إلى '+fmt(Math.min(total,start+state.size))+' من '+fmt(total):'0 سجلات')+'</span><label>في الصفحة<select data-mkt-control="size" aria-label="عدد السجلات في الصفحة">'+[10,25,50].map(n=>option(n,String(n),state.size)).join('')+'</select></label><div class="mkt-page-actions"><button type="button" data-mkt-page="-1" aria-label="الصفحة السابقة" '+(state.page===1?'disabled':'')+'>السابق</button><span>صفحة '+fmt(state.page)+' من '+fmt(pages)+'</span><button type="button" data-mkt-page="1" aria-label="الصفحة التالية" '+(state.page===pages?'disabled':'')+'>التالي</button></div></div>';
  }
  function dataPanel(view,heading,tabs='') {
    return '<section class="mkt-data-panel" data-mkt-view="'+view+'"><header class="mkt-data-heading"><h2>'+heading+'</h2>'+tabs+'</header>'+toolbar(view)+'<div id="mkt-results">'+paginatedResults(view)+'</div></section>';
  }
  function stampsPage(){
    const header=title('الولاء','بطاقات الزيارات وجلسات العناية، في مكان واحد.','<div class="mkt-header-controls">'+sourceControl()+refreshButton()+'</div>');
    if(!snapshot())return header+sourceNotice()+alertBox()+noData();
    const rows=stampMembers(snapshot()),allRewards=new Map();
    rows.forEach(member=>(member.stampCard.rewards||[]).forEach(reward=>{if(!allRewards.has(reward.id)||reward.receivedGift)allRewards.set(reward.id,reward);}));
    return '<div class="mkt-scale">'+header+sourceNotice()+alertBox()+stats([['بطاقات العميلات',fmt(rows.length)],['جلسات متاحة',fmt([...allRewards.values()].filter(available).length)],['قرب اكتمال البطاقة',fmt(rows.filter(m=>m.stampCard.stamps===4).length)]])+
      '<section class="mkt-program-rule"><strong>5 زيارات = جلسة عناية</strong><details><summary>شروط احتساب الزيارة</summary><p>تُحتسب الزيارات الشخصية المكتملة والمدفوعة. الجلسة المجانية: تنظيف البشرة الأساسي، للعميلة أو هدية تُنقل مرة واحدة.</p></details></section>'+dataPanel('loyalty','بطاقات العميلات')+'</div>';
  }
  let referralView='referrals';
  function referralsPage(){
    const header=title('الإحالات','الدعوات وأرصدة صاحباتها، من أول زيارة مستحقة.','<div class="mkt-header-controls">'+sourceControl()+refreshButton()+'</div>');
    if(!snapshot())return header+sourceNotice()+alertBox()+noData();
    const list=snapshot().referrals||[],amount=snapshot().referralCreditSar,done=r=>['earned','completed','awarded'].includes(r.status);
    const tabs='<div class="mkt-view-tabs" role="group" aria-label="عرض الإحالات">'+[['referrals','سجل الإحالات'],['wallets','المحافظ']].map(([key,label])=>'<button type="button" data-mkt-ref-view="'+key+'" aria-pressed="'+(referralView===key)+'">'+label+'</button>').join('')+'</div>';
    return '<div class="mkt-scale">'+header+sourceNotice()+alertBox()+stats([['إجمالي الإحالات',fmt(list.length)],['بانتظار أول زيارة',fmt(list.filter(r=>r.status==='pending').length)],['إحالات مكتملة',fmt(list.filter(done).length)]])+
      '<section class="mkt-program-rule"><strong>رصيد صاحبة الدعوة: '+money(amount)+(source==='demo'?' <small>· مبلغ توضيحي</small>':'')+'</strong><details><summary>متى يُضاف الرصيد؟</summary><p>يُضاف إلى محفظة صاحبة الدعوة وحدها بعد أول زيارة مستحقة للعميلة المدعوّة.</p></details>'+(source==='clinic'?'<button type="button" data-mkt-credit>'+ (amount==null?'تحديد المبلغ':'تعديل المبلغ')+'</button>':'')+'</section>'+dataPanel(referralView,referralView==='wallets'?'محافظ العميلات':'متابعة الدعوات',tabs)+'</div>';
  }
  function updateResults(focus) {
    const section=document.querySelector('[data-mkt-view]');if(!section)return;
    currentView=section.dataset.mktView;document.getElementById('mkt-results').innerHTML=paginatedResults(currentView);
    if(focus){const target=document.querySelector(focus);(target&&!target.disabled?target:document.getElementById('mkt-result-count'))?.focus({preventScroll:true});}
  }
  let detail={member:null,tab:'visits',page:1};
  function detailRecords() {
    const member=detail.member,card=member.stampCard||{},rows=detail.tab==='visits'?(card.visits||[]):detail.tab==='rewards'?(card.rewards||[]):(member.referralWallet?.entries||[]);
    const sorted=[...rows].sort((a,b)=>String(b.at||b.earnedAt||b.createdAt||'').localeCompare(String(a.at||a.earnedAt||a.createdAt||''))),pages=Math.max(1,Math.ceil(rows.length/10));detail.page=Math.min(pages,Math.max(1,detail.page));
    const content=sorted.slice((detail.page-1)*10,detail.page*10).map(row=>'<li><div><strong>'+E(detail.tab==='visits'?'زيارة مكتملة':detail.tab==='rewards'?(row.receivedGift?'جلسة هدية واردة':'تنظيف البشرة الأساسي'):(referralNames[row.status]||'حركة محفظة'))+'</strong><span>'+recordDate(row.at||row.earnedAt||row.createdAt)+'</span></div><div>'+(detail.tab==='rewards'?statusText(rewardNames[row.status]||'مسجّلة'):detail.tab==='wallet'?money(row.amountSar):'<bdi class="mkt-code">'+E(row.bookingId||'غير مسجل')+'</bdi>')+'</div></li>').join('');
    return '<ul class="mkt-detail-records">'+(content||'<li>لا توجد سجلات في هذا القسم.</li>')+'</ul><div class="mkt-detail-pagination"><span role="status" aria-live="polite">'+fmt(rows.length)+' سجل · صفحة '+fmt(detail.page)+' من '+fmt(pages)+'</span><button type="button" data-mkt-detail-page="-1" '+(detail.page===1?'disabled':'')+'>السابق</button><button type="button" data-mkt-detail-page="1" '+(detail.page===pages?'disabled':'')+'>التالي</button></div>';
  }
  function showMember(id) {
    const member=memberIndex().get(id);if(!member)return;
    detail={member,tab:'visits',page:1};
    modal('ملف الولاء والإحالات','<div class="mkt mkt-member-detail">'+(source==='demo'?'<p class="mkt-detail-note">بيانات توضيحية · ملف للعرض فقط</p>':'')+identity(member)+'<p class="mkt-member-code">كود الإحالة <bdi>'+E(member.referralCode||'غير مسجل')+'</bdi></p>'+stats([['الزيارات',fmt(member.stampCard?.totalVisits||0)],['جلسات متاحة',fmt((member.stampCard?.rewards||[]).filter(available).length)],['رصيد المحفظة',money(member.referralWallet?.balanceSar??0)]])+'<div class="mkt-view-tabs" role="group" aria-label="سجلات العميلة">'+[['visits','الزيارات'],['rewards','جلسات العناية'],['wallet','حركات المحفظة']].map(([key,label])=>'<button type="button" data-mkt-detail-tab="'+key+'" aria-pressed="'+(key===detail.tab)+'">'+label+'</button>').join('')+'</div><div id="mkt-detail-results">'+detailRecords()+'</div></div>');
    const dialog=document.getElementById('dialog'),heading=dialog.querySelector('h2');heading.id='mkt-detail-title';dialog.setAttribute('aria-labelledby',heading.id);dialog.querySelector('.section-head button')?.setAttribute('aria-label','إغلاق ملف العميلة');
  }
  function page(id) {
    if(id==='contest')return window.StaffCareContest?.page()||'';
    if (account()!==owner) {clear();owner=account();}
    let content;
    if(id==='loyalty'||id==='referrals'){
      if (source==='clinic' && !error && !busy && !S.pending && Date.now()-loadedAt>=30000) queueMicrotask(()=>load());
      currentView=id==='loyalty'?'loyalty':referralView;
      content=id==='loyalty'?stampsPage():referralsPage();
    } else content=id==='maeen'?coming():overview();
    return '<div class="mkt">'+content+'</div>';
  }
  let editRevision = null, savedNotice = false;
  window.addEventListener('hashchange',()=>{if(savedNotice){savedNotice=false;B.feedback('');}});
  function editCredit() {
    if (source!=='clinic' || !data || S.pending) return;
    editRevision=data.revision;
    modal('قيمة الإحالة', '<form id="mkt-credit-form"><label class="mkt-label">المبلغ بالريال<input type="number" name="amount" min="0.01" max="10000" step="0.01" inputmode="decimal" value="'+E(data.referralCreditSar??'')+'" placeholder="غير محدد"></label><p class="mkt-help">يُطبق المبلغ على الإحالات الجديدة فقط. اتركي الحقل فارغًا لإيقاف منح رصيد للإحالات الجديدة.</p><p class="mkt-form-error" role="alert"></p><div class="footer"><button type="submit" class="primary">حفظ المبلغ</button><button type="button" data-staff-click="closeModal()">إلغاء</button></div></form>');
    const dialog=document.getElementById('dialog');dialog.querySelector('h2').id='mkt-credit-title';dialog.setAttribute('aria-labelledby','mkt-credit-title');dialog.querySelector('.section-head button')?.setAttribute('aria-label','إغلاق تعديل مبلغ الإحالة');
    document.querySelector('#mkt-credit-form input').focus();
  }
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='mkt-credit-form')return;
    event.preventDefault();
    const form=event.target, input=form.elements.amount;
    if(!form.reportValidity() || source!=='clinic' || !data || S.pending)return;
    const value=input.value.trim(), amount=value===''?null:Number(value);
    await B.mutateLoyalty({action:'referral-credit-save', amountSar:amount, revision:editRevision}, result=>{
      data=result;loadedAt=Date.now();closeModal();B.render();savedNotice=true;B.feedback('حُفظت قيمة الإحالات الجديدة.');
    }, async cause=>{
      if(cause.status===409){await load(true);editRevision=data?.revision;}
      form.querySelector('.mkt-form-error').textContent=cause.status===409?'تغيّرت الإعدادات. المبلغ المحفوظ الآن '+money(data?.referralCreditSar)+'؛ راجعي مدخلاتك ثم احفظي.':cause.message||'تعذّر حفظ المبلغ.';
    });
  });
  document.addEventListener('input',event=>{
    if(!event.target.matches('[data-mkt-search]'))return;
    const view=event.target.closest('[data-mkt-view]').dataset.mktView;
    views[view].query=event.target.value;views[view].page=1;clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>updateResults(),160);
  });
  document.addEventListener('change',event=>{
    const target=event.target;
    if(target.id==='mkt-data-source'&&localPreview){
      source=target.value==='demo'?'demo':'clinic';clearTimeout(searchTimer);read++;busy=false;
      Object.values(views).forEach(state=>Object.assign(state,{query:'',status:'all',page:1}));
      B.render();document.getElementById('mkt-data-source')?.focus();return;
    }
    if(target.dataset.mktControl){
      const view=target.closest('[data-mkt-view]').dataset.mktView,key=target.dataset.mktControl;
      if(!['status','sort','size'].includes(key))return;
      views[view][key]=key==='size'?[10,25,50].includes(Number(target.value))?Number(target.value):25:target.value;views[view].page=1;clearTimeout(searchTimer);
      updateResults(key==='size'?'[data-mkt-control="size"]':null);return;
    }
    if(target.id!=='mkt-period'||!months[target.value])return;
    period=target.value;B.render();document.getElementById('mkt-period')?.focus();
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-mkt-metric],[data-mkt-refresh],[data-mkt-credit],[data-mkt-page],[data-mkt-clear],[data-mkt-member],[data-mkt-ref-view],[data-mkt-detail-tab],[data-mkt-detail-page]');
    if(!target)return;
    if(target.hasAttribute('data-mkt-refresh'))return source==='clinic'&&load(true);
    if(target.hasAttribute('data-mkt-credit'))return editCredit();
    if(target.hasAttribute('data-mkt-member'))return showMember(target.dataset.mktMember);
    if(target.hasAttribute('data-mkt-detail-tab')){
      detail.tab=target.dataset.mktDetailTab;detail.page=1;
      document.querySelectorAll('[data-mkt-detail-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button===target)));
      document.getElementById('mkt-detail-results').innerHTML=detailRecords();return;
    }
    if(target.hasAttribute('data-mkt-detail-page')){
      detail.page+=Number(target.dataset.mktDetailPage);document.getElementById('mkt-detail-results').innerHTML=detailRecords();
      const next=document.querySelector('[data-mkt-detail-page="'+target.dataset.mktDetailPage+'"]');
      if(next&&!next.disabled)next.focus({preventScroll:true});else document.querySelector('[data-mkt-detail-tab][aria-pressed=true]')?.focus({preventScroll:true});return;
    }
    if(target.hasAttribute('data-mkt-ref-view')){
      clearTimeout(searchTimer);referralView=target.dataset.mktRefView;B.render();document.querySelector('[data-mkt-ref-view="'+referralView+'"]')?.focus();return;
    }
    if(target.hasAttribute('data-mkt-page')){
      clearTimeout(searchTimer);views[target.closest('[data-mkt-view]').dataset.mktView].page+=Number(target.dataset.mktPage);
      return updateResults('[data-mkt-page="'+target.dataset.mktPage+'"]');
    }
    if(target.hasAttribute('data-mkt-clear')){
      const section=target.closest('[data-mkt-view]'),state=views[section.dataset.mktView];clearTimeout(searchTimer);state.query='';state.status='all';state.page=1;
      section.querySelector('[data-mkt-search]').value='';section.querySelector('[data-mkt-control="status"]').value='all';updateResults('[data-mkt-search]');return;
    }
    metric=target.dataset.mktMetric;B.render();document.querySelector('[data-mkt-metric="'+metric+'"]')?.focus();
  });
  window.addEventListener('hashchange',()=>clearTimeout(searchTimer));
  window.StaffMarketing={page};
})();
