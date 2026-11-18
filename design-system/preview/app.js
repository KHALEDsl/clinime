let locale = 'en';
let bookingLocale = 'ar';
let bookingStep = 'choose';
let selectedTime = '12:15';
let selectedDay = 26;
let selectedService = 0;
let selectedAppointment = 2;
let currentView = 'list';
let busy = false;
let toastTimer;
const $ = s => document.querySelector(s);
const appointments = [
  {time:'09:00',name:['Hala Al-Salem','هالة السالم'],service:['Skin consultation','استشارة جلدية'],status:'Completed',payment:['Paid','مدفوع'],doctor:['Dr. Laila Hasan','د. ليلى حسن'],duration:30},
  {time:'10:00',name:['Maha Al-Otaibi','مها العتيبي'],service:['Follow-up consultation','استشارة متابعة'],status:'Completed',payment:['Paid','مدفوع'],doctor:['Dr. Laila Hasan','د. ليلى حسن'],duration:30},
  {time:'11:30',name:['Nora Al-Harbi','نورة الحربي'],service:['Deep cleansing facial','تنظيف البشرة'],status:'In care',payment:['Paid','مدفوع'],doctor:['Dr. Laila Hasan','د. ليلى حسن'],duration:45},
  {time:'12:15',name:['Reem Al-Qahtani','ريم القحطاني'],service:['Skin consultation','استشارة جلدية'],status:'Confirmed',payment:['Unpaid','غير مدفوع'],doctor:['Dr. Laila Hasan','د. ليلى حسن'],duration:30},
  {time:'13:00',name:['Lina Al-Zahrani','لينا الزهراني'],service:['Hydration treatment','جلسة ترطيب'],status:'Confirmed',payment:['Part paid','مدفوع جزئيًا'],doctor:['Dr. Amal Saleh','د. أمل صالح'],duration:45},
  {time:'14:00',name:['Dana Al-Nasser','دانة الناصر'],service:['Follow-up consultation','استشارة متابعة'],status:'Confirmed',payment:['Unpaid','غير مدفوع'],doctor:['Dr. Amal Saleh','د. أمل صالح'],duration:30},
];
const services = [
  {name:['Deep cleansing facial','تنظيف البشرة'],price:350,duration:45,icon:'droplets'},
  {name:['Skin consultation','استشارة جلدية'],price:250,duration:30,icon:'stethoscope'},
];
const statusArabic={'Completed':'مكتمل','In care':'في الجلسة','Confirmed':'مؤكد'};
const tr=(en,ar)=>locale==='ar'?ar:en;
const bt=(en,ar)=>bookingLocale==='ar'?ar:en;
const ic=(name,extra='')=>`<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const escapeHtml = value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function hydrateIcons(root=document){root.querySelectorAll('i[data-icon]').forEach(el=>el.outerHTML=ic(el.dataset.icon));}
async function loadIcons(){const res=await fetch('assets/clinime-icons.svg');const holder=document.createElement('div');holder.hidden=true;holder.innerHTML=await res.text();document.body.prepend(holder);hydrateIcons();}
function showToast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function renderAppointments(){
  const q=$('#patient-search').value.trim().toLowerCase();const filter=$('#status-filter').value;let shown=0;
  $('#appointment-list').innerHTML=appointments.map((a,i)=>{
    if((filter!=='all'&&a.status!==filter)||q&&![...a.name,...a.service].join(' ').toLowerCase().includes(q))return '';
    shown++;const idx=locale==='ar'?1:0;
    const [hour,minute]=a.time.split(':').map(Number);const offset=(hour-9)*80+minute*80/60;
    return `<div class="appointment-row ${selectedAppointment===i?'selected':''}" style="--event-offset:${offset}px;--event-height:${a.duration*80/60}px"><span class="time">${a.time}</span><div><button class="patient-select" data-appointment="${i}" aria-pressed="${selectedAppointment===i}" aria-label="${a.name[idx]}, ${a.time}, ${a.duration} ${tr('minutes','دقيقة')}, ${a.service[idx]}, ${locale==='ar'?statusArabic[a.status]:a.status}, ${a.payment[idx]}">${a.name[idx]}</button><div class="patient-service">${a.service[idx]}</div></div><div class="appointment-status"><span class="status ${a.status==='In care'?'active':a.status==='Confirmed'?'confirmed':'completed'}">${a.status==='In care'?ic('activity'):''}${locale==='ar'?statusArabic[a.status]:a.status}</span><span class="payment-state">${a.payment[idx]}</span></div></div>`;
  }).join('');
  $('#empty-result').hidden=shown>0;$('#selected-appointment').hidden=shown===0;
  const a=appointments[selectedAppointment];const idx=locale==='ar'?1:0;
  $('#selected-appointment').innerHTML=`${ic('stethoscope')}<div><strong>${a.doctor[idx]}</strong><p>${tr('Room 02','غرفة 02')} &nbsp; ${a.duration} ${tr('min','دقيقة')}</p></div><button class="text-button" id="patient-details">${tr('Open patient file','فتح ملف المراجعة')}</button>`;
  document.querySelectorAll('[data-appointment]').forEach(btn=>btn.addEventListener('click',()=>{selectedAppointment=Number(btn.dataset.appointment);renderAppointments();}));
  $('#patient-details').onclick=()=>showToast(tr(`Preview: ${a.name[0]}'s record would open here.`,`معاينة: سيُفتح ملف ${a.name[1]} هنا.`));
}
function renderBooking(){
  const panel=$('#booking');panel.lang=bookingLocale;panel.dir=bookingLocale==='ar'?'rtl':'ltr';
  const top=panel.querySelector('.booking-top');
  top.innerHTML=`<span>${bt('Book an appointment','حجز موعد')}</span><button class="booking-language text-button" id="booking-language" aria-label="${bt('Switch booking to Arabic','عرض الحجز بالإنجليزية')}">${bt('العربية','English')}</button><span class="step-label" id="booking-step">${bookingStep==='choose'?bt('1 of 2','1 من 2'):bookingStep==='review'?bt('2 of 2','2 من 2'):bt('Booking status','حالة الحجز')}</span>`;
  $('#booking-language').disabled=busy;$('#booking-language').onclick=()=>{if($('#booking-name')){window.bookingName=$('#booking-name').value;window.bookingPhone=$('#booking-phone').value;}bookingLocale=bookingLocale==='ar'?'en':'ar';renderBooking();};
  panel.querySelector('.booking-footer span').textContent=bt('Preview only. No request will be sent.','معاينة للحجز. لن يُرسل أي طلب للعيادة.');
  const s=services[selectedService];const sname=s.name[bookingLocale==='ar'?1:0];
  const chosenDay=bt(['Sunday','Monday','Tuesday','Wednesday','Thursday'][selectedDay-25],['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'][selectedDay-25]);
  const summary=`<div class="booking-summary"><strong>${sname}</strong><p>${chosenDay} ${selectedDay} ${bt('October','أكتوبر')}، <bdi>${selectedTime}</bdi><br>${bt('Dr. Laila Hasan','د. ليلى حسن')}<br>${s.duration} ${bt('min','دقيقة')} &nbsp; ${s.price} ${bt('SAR','ر.س')}</p></div>`;
  if(bookingStep==='choose'){
    $('#booking-content').innerHTML=`<h2 id="booking-title">${bt('Make time for your care.','اختاري موعدك')}</h2><p class="booking-subtitle">${bt('Olive Clinic, Al Nakheel branch','عيادات أوليف، فرع النخيل')}</p><button class="booking-service" id="choose-service" aria-haspopup="true">${ic(s.icon)}<div><strong>${sname}</strong><span>${bt('Dr. Laila Hasan','د. ليلى حسن')} &nbsp; ${s.duration} ${bt('min','دقيقة')}</span></div><span class="price">${s.price} ${bt('SAR','ر.س')}</span>${ic('chevron-down')}</button><div id="service-options" hidden>${services.map((svc,i)=>`<button class="service-option" data-service="${i}" aria-pressed="${i===selectedService}">${svc.name[bookingLocale==='ar'?1:0]}<span>${svc.price} ${bt('SAR','ر.س')}</span></button>`).join('')}</div><div class="booking-section-label"><strong>${bt('Choose a day','اختاري اليوم')}</strong><span>${bt('October 2026','أكتوبر 2026')}</span></div><div class="date-choices" aria-label="${bt('Available dates','الأيام المتاحة')}">${[25,26,27,28,29].map((d,i)=>`<button class="date-button ${d===selectedDay?'selected':''}" data-date="${d}" aria-pressed="${d===selectedDay}"><span>${bt(['Sun','Mon','Tue','Wed','Thu'][i],['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'][i])}</span><strong>${d}</strong></button>`).join('')}</div><div class="booking-section-label"><strong>${bt('Available times','الأوقات المتاحة')}</strong><span>${bt('Riyadh time','بتوقيت الرياض')}</span></div><div class="time-choices" aria-label="${bt('Available times','الأوقات المتاحة')}">${['10:00','10:45','11:30','12:15','13:00','13:45'].map(t=>`<button class="time-button ${t===selectedTime?'selected':''}" data-time="${t}" ${t==='11:30'?'disabled aria-label="'+bt('11:30 unavailable','11:30 غير متاح')+'"':''} aria-pressed="${t===selectedTime}">${t}</button>`).join('')}</div><button class="button primary booking-cta" id="continue-booking">${bt('Continue','متابعة')}${ic(bookingLocale==='ar'?'arrow-left':'arrow-right')}</button>`;
    $('#choose-service').onclick=()=>$('#service-options').hidden=!$('#service-options').hidden;
    document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>{selectedService=Number(b.dataset.service);renderBooking();});
    document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{selectedDay=Number(b.dataset.date);renderBooking();});
    document.querySelectorAll('[data-time]:not(:disabled)').forEach(b=>b.onclick=()=>{selectedTime=b.dataset.time;renderBooking();});
    $('#continue-booking').onclick=()=>{bookingStep='review';renderBooking();$('#booking-title').focus();};
  }else if(bookingStep==='review'){
    $('#booking-content').innerHTML=`<button class="back-button" id="back-booking">${ic(bookingLocale==='ar'?'arrow-right':'arrow-left')}${bt('Change appointment','تعديل الموعد')}</button><h2 id="booking-title" tabindex="-1">${bt('Review your booking','راجعي تفاصيل الحجز')}</h2>${summary}<form id="booking-form" novalidate><label class="field"><span>${bt('Full name','الاسم الكامل')}</span><input id="booking-name" autocomplete="name" value="${escapeHtml(window.bookingName||'')}" required></label><label class="field"><span>${bt('Mobile number','رقم الجوال')}</span><input id="booking-phone" autocomplete="tel" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" value="${escapeHtml(window.bookingPhone||'')}" aria-describedby="booking-error" required></label><p class="field-error" id="booking-error" hidden></p><button class="button primary booking-cta" id="confirm-booking" type="submit">${bt('Confirm booking','تأكيد الموعد')}</button></form>`;
    $('#back-booking').onclick=()=>{window.bookingName=$('#booking-name').value;window.bookingPhone=$('#booking-phone').value;bookingStep='choose';renderBooking();};
    $('#booking-form').onsubmit=e=>{
      e.preventDefault();if(busy)return;window.bookingName=$('#booking-name').value;window.bookingPhone=$('#booking-phone').value;
      const nameValid=window.bookingName.trim().length>1,phoneValid=/^05\d{8}$/.test(window.bookingPhone.replace(/\s/g,''));
      $('#booking-name').classList.toggle('invalid',!nameValid);$('#booking-phone').classList.toggle('invalid',!phoneValid);
      $('#booking-name').setAttribute('aria-invalid',String(!nameValid));$('#booking-phone').setAttribute('aria-invalid',String(!phoneValid));
      if(!nameValid||!phoneValid){$('#booking-error').hidden=false;$('#booking-error').textContent=!nameValid?bt('Enter your full name.','أدخلي اسمك الكامل.'):bt('Enter a 10 digit number starting with 05.','أدخلي رقمًا من 10 أرقام يبدأ بـ 05.');(!nameValid?$('#booking-name'):$('#booking-phone')).focus();return;}
      busy=true;$('#booking-language').disabled=true;const btn=$('#confirm-booking');btn.disabled=true;btn.classList.add('loading');btn.setAttribute('aria-busy','true');btn.innerHTML=ic('loader-circle')+bt('Checking availability…','جارٍ التحقق من التوفر…');
      setTimeout(()=>{busy=false;bookingStep='unknown';renderBooking();},1100);
    };
  }else if(bookingStep==='unknown'){
    $('#booking-content').innerHTML=`<div class="booking-result">${ic('cloud-off')}<h2 id="booking-title" tabindex="-1">${bt('We are checking your booking','لم نتأكد من الحجز بعد')}</h2><p>${bt('The response was interrupted. Check the status before booking again so the appointment is not duplicated.','انقطعت الاستجابة. تحققي من الحالة قبل الحجز مجددًا لتجنب تكرار الموعد.')}</p>${summary}<div class="booking-reference">${bt('Reference','المرجع')}: <b>DEMO-026</b></div><button class="button primary" id="check-booking">${bt('Check booking status','التحقق من حالة الحجز')}</button></div>`;
    $('#check-booking').onclick=()=>{if(busy)return;busy=true;$('#booking-language').disabled=true;const btn=$('#check-booking');btn.disabled=true;btn.classList.add('loading');btn.innerHTML=ic('loader-circle')+bt('Checking…','جارٍ التحقق…');setTimeout(()=>{busy=false;bookingStep='success';renderBooking();},900);};
  }else{
    $('#booking-content').innerHTML=`<div class="booking-result success">${ic('circle-check')}<h2 id="booking-title" tabindex="-1">${bt('Your appointment is confirmed','تم تأكيد موعدك')}</h2><p>${bt('This is a simulated confirmation. No appointment was sent to the clinic.','هذا تأكيد تجريبي. لم يُرسل أي موعد إلى العيادة.')}</p>${summary}<div class="booking-reference">${bt('Reference','المرجع')}: <b>DEMO-026</b></div><button class="button secondary" id="restart-booking">${bt('Start a new preview','بدء معاينة جديدة')}</button></div>`;
    $('#restart-booking').onclick=()=>{bookingStep='choose';renderBooking();};
  }
  $('#booking-title')?.setAttribute('tabindex','-1');
}
function setLocale(next){locale=next;$('#patient-search').setAttribute('aria-label',tr('Search appointments','البحث في المواعيد'));$('#status-filter').setAttribute('aria-label',tr('Filter appointments','تصفية المواعيد'));document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.querySelectorAll('[data-en]').forEach(el=>el.textContent=el.dataset[locale]);document.querySelectorAll('[data-placeholder-en]').forEach(el=>el.placeholder=el.dataset[locale==='ar'?'placeholderAr':'placeholderEn']);$('#locale-toggle').innerHTML=tr('العربية','English')+ic('languages');$('#status-filter').options[0].text=tr('All statuses','كل الحالات');$('#status-filter').options[1].text=tr('Confirmed','مؤكد');$('#status-filter').options[2].text=tr('In care','في الجلسة');$('#status-filter').options[3].text=tr('Completed','مكتمل');renderAppointments();}
$('#locale-toggle').onclick=()=>setLocale(locale==='en'?'ar':'en');
$('#theme-toggle').onclick=()=>{const dark=document.documentElement.dataset.theme==='light';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme-toggle').innerHTML=ic(dark?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',tr(`Switch to ${dark?'light':'dark'} theme`,`تبديل المظهر إلى ${dark?'الفاتح':'الداكن'}`));};
$('#patient-search').oninput=renderAppointments;$('#status-filter').onchange=renderAppointments;
$('#clear-filters').onclick=()=>{$('#patient-search').value='';$('#status-filter').value='all';renderAppointments();};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});$('#appointment-list').classList.toggle('day-view',currentView==='day');});
document.querySelectorAll('.sidebar nav a:not([aria-current])').forEach(a=>a.onclick=e=>{e.preventDefault();showToast(tr(`${a.textContent.trim()} is a navigation preview. The appointment workspace remains open.`,`${a.textContent.trim()} رابط تجريبي. تبقى مساحة المواعيد مفتوحة.`));});
const dialog=$('#appointment-dialog');let priorFocus;
$('#add-appointment').onclick=()=>{priorFocus=document.activeElement;$('#appointment-error').hidden=true;$('#new-patient').value='';$('#new-patient').removeAttribute('aria-invalid');dialog.showModal();};
$('#close-dialog').onclick=$('#cancel-dialog').onclick=()=>dialog.close();
dialog.onclose=()=>priorFocus?.focus();
$('#appointment-form').onsubmit=e=>{e.preventDefault();const input=$('#new-patient');if(!input.value.trim()){$('#appointment-error').hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}dialog.close();showToast(tr(`Preview prepared for ${input.value.trim()}. No record was saved.`,`تم تجهيز معاينة لـ ${input.value.trim()}. لم يُحفظ أي سجل.`));};
$('#save-demo').onclick=()=>{const b=$('#save-demo');if(b.disabled)return;b.disabled=true;b.classList.add('loading');b.innerHTML=ic('loader-circle')+tr('Saving…','جارٍ الحفظ…');setTimeout(()=>{b.disabled=false;b.classList.remove('loading');b.innerHTML=ic('check')+tr('Save changes','حفظ التغييرات');$('#action-status').textContent=tr('Preview saved for this session.','حُفظت المعاينة لهذه الجلسة.');},1000);};
$('#reset-demo').onclick=()=>{$('#action-status').textContent='';$('#sample-name').value='';$('#sample-phone').value='055';$('#sample-phone').classList.add('invalid');$('#sample-phone').setAttribute('aria-invalid','true');$('#sample-phone-error').hidden=false;};
$('#details-demo').onclick=()=>showToast(tr('Preview: the appointment detail panel would open here.','معاينة: ستُفتح تفاصيل الموعد هنا.'));
$('#cancel-demo').onclick=()=>showToast(tr('Cancellation is a preview action. No appointment was changed.','الإلغاء إجراء تجريبي. لم تتغير أي مواعيد.'));
$('#sample-phone').oninput=e=>{const valid=/^05\d{8}$/.test(e.target.value.replace(/\s/g,''));e.target.classList.toggle('invalid',!valid);e.target.setAttribute('aria-invalid',String(!valid));$('#sample-phone-error').hidden=valid;};
$('#unknown-demo').onclick=e=>{const b=e.currentTarget;b.disabled=true;b.textContent=tr('Checking…','جارٍ التحقق…');setTimeout(()=>{b.disabled=false;b.textContent=tr('Check status','التحقق من الحالة');showToast(tr('Preview check complete. The booking is confirmed.','اكتمل التحقق التجريبي. الحجز مؤكد.'));},900);};
renderAppointments();renderBooking();loadIcons();
