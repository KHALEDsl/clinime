/* Operational overview. Numbers are derived from the currently loaded clinic ledger. */
(() => {
  'use strict';
  const R = window.StaffRuntime, E = R.E;
  const nf = new Intl.NumberFormat('ar-SA-u-nu-latn',{maximumFractionDigits:0});
  const number = value => nf.format(Number(value)||0);
  let days = 7;
  const people = () => (R.state.workspace?.professionals||[]).filter(person=>person.active!==false);
  const bookingCount = value => value===1?'حجز واحد':value===2?'حجزان':number(value)+(value>=3&&value<=10?' حجوزات':' حجزًا');
  const name = person => person?.nameAr||person?.nameEn||'أخصائية';
  const portrait = person => person?.image?'<img src="'+E(person.image)+'" alt="" loading="lazy">':'<span>'+E(name(person).charAt(0))+'</span>';
  function header(title, sub, action='') {
    return '<header class="dash-heading"><div><span class="dash-eyebrow">CLINIME · NOTHING MAJOR</span><h1>'+title+'</h1><p>'+sub+'</p></div>'+action+'</header>';
  }
  function panel(title, hint, body, action='') {
    return '<section class="dash-panel"><header><div><h2>'+title+'</h2>'+(hint?'<p>'+hint+'</p>':'')+'</div>'+action+'</header>'+body+'</section>';
  }
  function dates() {
    return Array.from({length:days},(_,i)=>{
      const date=new Date(today+'T12:00:00+03:00');
      date.setUTCDate(date.getUTCDate()-(days-1-i));
      return date.toISOString().slice(0,10);
    });
  }
  function counts() {
    return dates().map(date=>({date,count:db.appointments.filter(a=>a.date===date&&a.status!=='cancelled').length}));
  }
  function chart() {
    const data=counts(),max=Math.max(1,...data.map(d=>d.count)),width=600,height=204;
    const gap=days===7?18:5,bar=Math.min(52,(520-gap*(days-1))/days),step=(520-bar)/(days-1||1);
    const grid=[0,Math.ceil(max/2),max].filter((n,i,a)=>a.indexOf(n)===i).map(value=>{
      const y=152-value/max*120;
      return '<line x1="44" x2="578" y1="'+y+'" y2="'+y+'"/><text x="32" y="'+(y+4)+'" text-anchor="end">'+number(value)+'</text>';
    }).join('');
    const columns=data.map((d,i)=>{
      const h=d.count/max*120,x=50+i*step;
      const label=new Date(d.date+'T12:00:00+03:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{day:'numeric',month:days===7?'short':undefined});
      const showTick=days===7||i===0||i===days-1||i%7===0;
      return '<g class="dash-bar" tabindex="0" role="img" aria-label="'+E(label+'، '+d.count+' مواعيد')+'"><rect x="'+x+'" y="'+(152-h)+'" width="'+bar+'" height="'+Math.max(h,2)+'" rx="'+Math.min(6,bar/3)+'" class="'+(i===days-1?'is-today':'')+'"/><title>'+E(label+' · '+d.count+' مواعيد')+'</title><text class="dash-bar-value" x="'+(x+bar/2)+'" y="'+(145-h)+'" text-anchor="middle">'+number(d.count)+'</text>'+(showTick?'<text x="'+(x+bar/2)+'" y="183" text-anchor="middle">'+E(label)+'</text>':'')+'</g>';
    }).join('');
    return '<div class="dash-chart-summary"><strong>'+number(data.reduce((sum,d)=>sum+d.count,0))+'</strong><span>موعدًا خلال الفترة</span><span class="dash-chart-key"><i></i> عدد المواعيد</span></div><svg class="dash-booking-chart" viewBox="0 0 '+width+' '+height+'" dir="ltr" role="img" aria-label="المواعيد خلال آخر '+days+' يومًا"><g class="dash-grid">'+grid+'</g>'+columns+'</svg><details class="dash-data"><summary>عرض قيم الرسم</summary><table><thead><tr><th>التاريخ</th><th>عدد المواعيد</th></tr></thead><tbody>'+data.map(d=>'<tr><td>'+d.date+'</td><td>'+number(d.count)+'</td></tr>').join('')+'</tbody></table></details>';
  }
  function periodControl() {
    return '<div class="dash-period" role="group" aria-label="فترة الإحصاءات">'+[7,30].map(n=>'<button type="button" data-dash-period="'+n+'" aria-pressed="'+(days===n)+'">'+(n===7?'٧ أيام':'٣٠ يومًا')+'</button>').join('')+'</div>';
  }
  function statusRing(list) {
    const slices=[{label:'قيد الانتظار',value:list.filter(a=>['expected','waiting'].includes(a.status)).length,color:'#B8CCDB'},{label:'في الجلسة',value:list.filter(a=>a.status==='session').length,color:'#C992AA'},{label:'جاهزة للدفع',value:list.filter(a=>a.status==='checkout').length,color:'#DDBE8D'},{label:'مكتملة',value:list.filter(a=>a.status==='closed').length,color:'#2D3E5B'}];
    const total=slices.reduce((sum,s)=>sum+s.value,0);
    let current=0;
    const gradient=slices.filter(s=>s.value).map(s=>{const start=current;current+=s.value/(total||1)*100;return s.color+' '+start+'% '+current+'%'}).join(',');
    return '<div class="dash-ring-layout"><div class="dash-ring" role="img" aria-label="'+E(slices.map(s=>s.label+' '+s.value).join('، '))+'" style="--ring:conic-gradient('+(gradient||'#EDF0F4 0% 100%')+')"><div><strong>'+number(total)+'</strong><span>مواعيد اليوم</span></div></div><ul class="dash-ring-key">'+slices.map(s=>'<li><i style="background:'+s.color+'"></i><span>'+s.label+'</span><strong>'+number(s.value)+'</strong></li>').join('')+'</ul></div>';
  }
  function topServices() {
    const counts=new Map();
    db.appointments.filter(a=>a.status!=='cancelled').forEach(a=>(a.items||[]).forEach(item=>counts.set(item.serviceId,(counts.get(item.serviceId)||0)+1)));
    const ranked=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,3),max=ranked[0]?.[1]||1;
    return ranked.length?'<ol class="dash-service-ranks">'+ranked.map(([id,value],i)=>'<li><span class="dash-rank">'+(i+1)+'</span><div><div><strong>'+E(services.find(s=>s.backendId===id)?.name||id)+'</strong><span>'+bookingCount(value)+'</span></div><progress max="'+max+'" value="'+value+'">'+value+'</progress></div></li>').join('')+'</ol>':'<p class="dash-empty">تظهر الخدمات الأكثر حجزًا بعد تسجيل المواعيد.</p>';
  }
  function teamList(limit=4) {
    const roster=people();
    return roster.length?'<div class="dash-specialists">'+roster.slice(0,limit).map(person=>{
      const count=db.appointments.filter(a=>a.date===today&&a.raw?.professional===person.id&&a.status!=='cancelled').length;
      return '<div class="dash-specialist"><span class="dash-person-photo">'+portrait(person)+'</span><div><strong>'+E(name(person))+'</strong><small>'+E(person.titleAr||'أخصائية')+'</small></div><span class="dash-person-count">'+number(count)+' <small>اليوم</small></span></div>';
    }).join('')+'</div>':'<p class="dash-empty">لم يُضف فريق الأخصائيات بعد.</p>';
  }
  function upcoming(list) {
    const next=list.filter(a=>!['closed','cancelled'].includes(a.status)).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,4);
    return next.length?'<div class="dash-upcoming">'+next.map(a=>'<a href="#appointment/'+E(a.id)+'"><time dir="ltr">'+E(a.time)+'</time><div><strong>'+E(a.name)+'</strong><small>'+E(a.serviceName)+' · '+E(a.professionalName||'')+'</small></div><span class="dash-upcoming-state">'+E(statuses[a.status]||'موعد')+'</span></a>').join('')+'</div>':'<div class="dash-schedule-empty">'+ico('calendar')+'<strong>كل المواعيد مكتملة</strong><p>تظهر مواعيد اليوم القادمة هنا.</p><a href="#appointments">فتح التقويم ←</a></div>';
  }
  function home() {
    const list=db.appointments.filter(a=>a.date===today&&a.status!=='cancelled');
    const dayReceipts=(R.state.workspace?.receipts||[]).filter(r=>r.recordedAt&&new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date(r.recordedAt))===today),paid=dayReceipts.reduce((sum,r)=>sum+Number(r.amount||0),0);
    const metrics=[['calendar','مواعيد اليوم',list.length,'المواعيد المحفوظة','blue'],['users','عميلات اليوم',new Set(list.map(a=>a.patientId)).size,'حسب الموعد المسجّل','pink'],['service','الجلسات المكتملة',list.filter(a=>a.status==='closed').length,'بعد إغلاق الزيارة','neutral'],['stock','التحصيل المسجّل',paid,'ريال سعودي · إيصالات اليوم','neutral']];
    const control='<button type="button" class="primary" data-staff-click="booking()">＋ موعد جديد</button>';
    const ordered=list.filter(a=>!['pending','cancelled'].includes(a.status)&&(filter==='all'||a.status===filter)).sort((a,b)=>(a.status==='closed')-(b.status==='closed')||a.time.localeCompare(b.time));
    return '<div class="clinic-dashboard">'+header('نظرة على يوم العيادة',fmt(today),control)+
      '<div class="dash-kpis">'+metrics.map(([icon,label,value,caption,tone])=>'<section class="dash-kpi dash-kpi-'+tone+'"><div><span>'+label+'</span><strong>'+number(value)+'</strong><small>'+caption+'</small></div><span class="dash-kpi-icon">'+ico(icon)+'</span></section>').join('')+'</div>'+
      '<div class="dash-main-grid"><div class="dash-main-column">'+panel('حركة المواعيد','المواعيد المؤكدة حسب تاريخ الزيارة',chart(),periodControl())+
      '<div class="dash-secondary-grid">'+panel('مسار الزيارات اليوم','حالة المواعيد المسجّلة',statusRing(list))+panel('الأكثر حجزًا','من سجلات المواعيد الحالية',topServices())+'</div></div>'+
      '<aside class="dash-aside">'+panel('على جدول اليوم',new Date(today+'T12:00:00+03:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{day:'numeric',month:'long'}),upcoming(list),'<a href="#appointments">التقويم '+ico('calendar')+'</a>')+panel('الأخصائيات','الفريق المتاح للحجز',teamList(),'<a href="#specialists">عرض الفريق ←</a>')+'</aside></div>'+
      '<section class="panel dash-today"><div class="section-head"><div><h2>مواعيد اليوم</h2><p>الوصول، الانتظار، وإتمام الدفع في مكان واحد.</p></div><a href="#appointments">عرض التقويم ←</a></div><div class="filterbar">'+[['all','الكل'],['expected','متوقعة'],['waiting','في الانتظار'],['session','في الجلسة'],['checkout','بانتظار الدفع']].map(([key,label])=>'<button type="button" data-staff-click="setFilter(\''+key+'\')" '+(filter===key?'class="primary"':'')+'>'+label+'</button>').join('')+'</div>'+ '<div class="appointment-grid">'+(ordered.filter(a=>!['checkout','closed'].includes(a.status)).map(appointmentCard).join('')||'<div class="empty">لا توجد مواعيد متبقية اليوم.</div>')+'</div>'+(ordered.some(a=>['checkout','closed'].includes(a.status))?'<div class="dash-completed-visits">'+ordered.filter(a=>['checkout','closed'].includes(a.status)).map(appointmentCard).join('')+'</div>':'')+'</section></div>';
  }
  function team() {
    const roster=people();
    return '<div class="clinic-dashboard">'+header('فريق كلينيمي','أدوار واضحة وتجربة حجز متصلة بالعميلات.')+
      (R.state.workspace?.rosterIsSample?'<p class="dash-sample">أسماء وصور توضيحية للفريق.</p>':'')+
      '<div class="dash-team-leads"><article>'+ico('users')+'<div><h2>جيجي</h2><p>مديرة العيادة</p></div></article><article>'+ico('calendar')+'<div><h2>كندر</h2><p>موظف الاستقبال</p></div></article></div>'+
      '<section class="dash-panel dash-team-panel"><header><div><h2>الأخصائيات</h2><p>'+number(roster.length)+' أخصائيات للحجز ومتابعة الجلسات</p></div></header><div class="dash-team-grid">'+roster.map(person=>'<article><span class="dash-team-photo">'+portrait(person)+'</span><h3>'+E(name(person))+'</h3><p>'+E(person.titleAr||'أخصائية')+'</p><div class="dash-team-tags">'+(person.categoryIds||[]).map(id=>'<span>'+E(({skin:'البشرة',injectables:'الحقن',cosmetic:'التجميل',laser:'الليزر',consultations:'الاستشارات'})[id]||id)+'</span>').join('')+'</div><a href="#appointments">عرض جدول المواعيد ←</a></article>').join('')+'</div></section></div>';
  }
  window.StaffDashboard={home,team};
  window.home=home;
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-dash-period]');
    if(!trigger)return;
    days=Number(trigger.dataset.dashPeriod)===30?30:7;
    window.StaffBridge.render();
    document.querySelector('[data-dash-period="'+days+'"]')?.focus();
  });
})();
