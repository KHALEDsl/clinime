/* Clinime loyalty: server-authoritative wallet and booking promotion UI.
 * Visual craft follows unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
 * Private wallet data and uncertain receipts remain in memory only. */
(()=>{'use strict';
 const A=window.App,API=window.ClinimeAPI,S=()=>A.state,E=A.esc,X=(ar,en)=>A.x(ar,en),I=n=>A.icon(n);
 const routes=['wallet-start','visit-card','referrals','loyalty','loyalty-history','reward','loyalty-coupon','loyalty-terms'];
 let feedbackRoute=null,lastLocale=S().locale;
 let owner=null,generation=0,read=0,wallet=null,status='idle',error='',loading=null,receipt=null,redemptionError='',historyTab='points',feedback='',copyFallback=null;
 let promo={input:'',code:'',status:'idle',quote:null,error:'',itemsKey:'',sequence:0};
 const num=n=>new Intl.NumberFormat(S().locale==='ar'?'ar-SA':'en-GB',{maximumFractionDigits:0}).format(Number(n)||0);
 const money=n=>new Intl.NumberFormat(S().locale==='ar'?'ar-SA':'en-SA',{style:'currency',currency:'SAR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
 const date=v=>{if(!v)return X('غير محدد','Not specified');try{return new Intl.DateTimeFormat(S().locale==='ar'?'ar-SA-u-ca-gregory':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Riyadh'}).format(new Date(v));}catch(_){return'';}};
 const button=(action,label,{id='',cls='loyalty-button',disabled=false,extra=''}={})=>`<button type="button" class="${cls}" data-action="${action}" ${id?`data-id="${E(id)}"`:''} ${disabled?'disabled':''} ${extra}>${label}</button>`;
 const link=(action,label,id='',extra='')=>button(action,E(label),{id,cls:'loyalty-link',extra});
 const points=n=>`${num(n)} ${X(Number(n)>=3&&Number(n)<=10?'نقاط':'نقطة',Number(n)===1?'point':'points')}`;
 const rule=k=>wallet?.rules?.[k];
 const codeTag=code=>`<bdi class="loyalty-code" dir="ltr">${E(code)}</bdi>`;
 function speak(message){const el=document.getElementById('announce');if(el)el.textContent=message;}
 function announce(message){feedback=message;feedbackRoute=S().route;speak(message);}
 function recoverAuth(e){if(e?.code!=='AUTH_REQUIRED')return false;const route=routes.includes(S().route)||['account','review'].includes(S().route)?S().route:'loyalty',id=S().routeId;A.requireSignIn(route,id,errorText(e));identity();return true;}
 function identity(){if(lastLocale!==S().locale){lastLocale=S().locale;feedback='';}const next=S().auth?.id||null;if(owner===next)return;if(owner)forgetInvite();if(next)bindInvite(next);clearProgramState();owner=next;generation++;read++;wallet=null;status='idle';error='';loading=null;receipt=null;redemptionError='';feedback='';copyFallback=null;historyTab='points';promo={input:'',code:'',status:'idle',quote:null,error:'',itemsKey:'',sequence:promo.sequence+1};}
 function valid(g,o){return g===generation&&o===owner&&o===S().auth?.id;}
 function visible(){return S().route==='home'||routes.includes(S().route)||S().route==='account'||S().route==='review';}
 function paint(preserve=true){if(visible()||S().modal?.type?.startsWith('loyalty'))A.render({preserve});}
 function errorText(e){const map={WALLET_QUOTE_CHANGED:['تغيّر رصيد الإحالات قبل تأكيد الموعد. أعيدي تطبيق الرصيد وراجعي الإجمالي، أو أزيليه للمتابعة.','Your referral credit changed before the booking was confirmed. Apply your credit again and review the new total, or remove it to continue.'],PERSONAL_VISIT_REQUIRED:['هذه الميزة للحجز باسم صاحبة الحساب. للجلسة المجانية، أهديها للمستفيدة أولًا.','Book in your own name to use this benefit. To book a free facial for someone else, gift it to her first.'],REWARD_UNAVAILABLE:['لم تعد هذه الجلسة متاحة. حدّثي المكافآت.','This facial is no longer available. Refresh your rewards.'],REWARD_NOT_ELIGIBLE:['تُستخدم هذه المكافأة لجلسة تنظيف البشرة الأساسي فقط.','This reward applies only to the Basic Facial.'],WALLET_EMPTY:['ليس لديك رصيد إحالات متاح.','No referral credit is available.'],GIFT_SELF:['أدخلي بريد المستفيدة، أو احجزي الجلسة لنفسك.','Enter the recipient’s email, or book the facial for yourself.'],INVALID_EMAIL:['تحققي من البريد الإلكتروني.','Check the email address.'],LOYALTY_CONFLICT:['تغيّر رصيدك. حدّثي المكافآت ثم راجعي الاستبدال.','Your balance changed. Refresh rewards and review the exchange.'],LOYALTY_ENROLL_REQUIRED:['حدّثي المكافآت أولًا، ثم أعيدي الاستبدال.','Refresh rewards before trying the exchange again.'],INSUFFICIENT_POINTS:['رصيدك لا يكفي لهذه المكافأة. حدّثي الرصيد لاختيار مكافأة متاحة.','Your balance is too low for this reward. Refresh it to choose an available reward.'],PROMOTION_INVALID:['لم نعثر على هذا الرمز. تحققي منه ثم أعيدي تطبيقه.','This code was not found. Check it and apply it again.'],PROMOTION_EXPIRED:['انتهت صلاحية هذا الرمز. أزيليه أو استخدمي رمزًا آخر.','This code has expired. Remove it or use another code.'],PROMOTION_USED:['استُخدم هذا الرمز من قبل. أزيليه أو استخدمي رمزًا آخر.','This code has already been used. Remove it or use another code.'],SELF_REFERRAL:['هذا رمز دعوتك. يمكنك مشاركته مع صديقة بدلًا من استخدامه لحسابك.','This is your referral code. Share it with a friend instead of using it yourself.'],REFERRAL_INELIGIBLE:['رمز الدعوة متاح للحجز المؤهل الأول فقط. أزيلي الرمز للمتابعة.','A referral is for a first eligible booking only. Remove the code to continue.'],PROMOTION_NOT_ELIGIBLE:['الرمز لا يشمل الخدمات المختارة. عدّلي الخدمات أو أزيلي الرمز.','This code does not cover your selected treatments. Change treatments or remove the code.'],IDEMPOTENCY_CONFLICT:['تفاصيل هذا الطلب لا تطابق الطلب السابق. حدّثي المكافآت للتحقق من حالته.','This request differs from an earlier request. Refresh rewards to check its status.']};return map[e?.code]?X(...map[e.code]):A.errorMessage(e);}
 async function load({refresh=false}={}){identity();if(!owner)return;if(loading)return loading;const g=generation,o=owner,n=++read;status=wallet?'refreshing':'loading';error='';paint();const task=(async()=>{try{const result=await API.request('/api/loyalty');if(!valid(g,o)||n!==read)return;wallet=result;status='ready';error='';}catch(e){if(!valid(g,o)||n!==read)return;if(recoverAuth(e))return;status='error';error=errorText(e);}finally{if(valid(g,o)&&n===read){loading=null;paint();}}})();loading=task;return task;}
 let walletIntroAt=0, walletFlipped=false;
 function entered(route){if(route==='wallet-start'){walletIntroAt=performance.now();walletFlipped=false;}identity();if(feedbackRoute!==route)feedback='';if(!owner)return;enterProgram(route);if(route==='wallet-start'&&customWalletEnrollment())loadWalletRegistration();if(routes.includes(route)||route==='account'||route==='review')load();if(route==='review'&&promo.code&&!promo.requiresRequote&&(promo.status!=='ready'||promo.itemsKey!==itemsKey()))applyPromotion(promo.code);}
 function feedbackMarkup(){return feedback?`<p class="loyalty-feedback" role="status">${E(feedback)}</p>`:'';}
 function header(title){return `<header class="loyalty-topbar">${button('back',I('arrow'),{cls:'loyalty-icon',extra:`id="back-control" aria-label="${E(X('رجوع','Back'))}"`})}<span>${E(['loyalty','referrals'].includes(S().route)?X('حسابي','My account'):X('مكافآتي','My rewards'))}</span>${link('language',S().locale==='ar'?'English':'العربية','','lang="'+(S().locale==='ar'?'en':'ar')+'"')}</header>`;}
 function shell(title,body){return `<div class="journey-screen loyalty-screen">${header(title)}<main id="main-content" tabindex="-1"><div class="loyalty-heading"><h1 class="view-heading" tabindex="-1">${E(title)}</h1></div>${feedbackMarkup()}${body}</main></div>`;}
 function statePanel(){if(status==='loading'||status==='idle')return `<div class="loyalty-state" aria-busy="true" role="status"><span class="spinner"></span><p>${E(X('جارٍ تحميل مكافآتك…','Loading your rewards…'))}</p></div>`;if(!wallet)return `<section class="loyalty-state"><h2>${E(X('تعذّر تحميل المكافآت','Could not load rewards'))}</h2><p role="alert">${E(error)}</p>${button('loyalty-refresh',E(X('إعادة المحاولة','Try again')))}</section>`;return'';}
 function refreshNotice(){return `${status==='error'?`<p class="loyalty-error" role="alert">${E(error)}</p>`:''}<div class="loyalty-toolbar">${link('loyalty-refresh',status==='refreshing'?X('جارٍ التحديث…','Refreshing…'):X('تحديث الرصيد','Refresh balance'),'',status==='refreshing'?'disabled aria-busy="true"':'')}${link('nav',X('السجل','History'),'loyalty-history')}</div>`;}
 function nextReward(){return [...(wallet?.rewards||[])].sort((a,b)=>Number(a.points)-Number(b.points)).find(r=>Number(r.points)>Number(wallet.balance));}
 function progress(){const next=nextReward();if(!next)return `<p class="loyalty-caption">${E(X('رصيدك يتيح لك اختيار أي مكافأة متاحة','Your balance can cover any available reward'))}</p>`;const pc=Math.min(100,Math.max(0,Number(wallet.balance)/Number(next.points)*100));return `<div class="loyalty-progress"><div class="loyalty-progress-label"><span>${E(X('المكافأة التالية','Next reward'))}</span><span>${E(num(next.percent))}%</span></div><div class="loyalty-progress-track" role="progressbar" aria-valuenow="${Number(wallet.balance)||0}" aria-valuemin="0" aria-valuemax="${Number(next.points)}" aria-label="${E(X('التقدم نحو المكافأة التالية','Progress toward your next reward'))}"><span style="transform:scaleX(${pc/100})"></span></div><p>${E(X(`باقي ${points(next.remainingPoints??Number(next.points)-Number(wallet.balance))} لخصم ${num(next.percent)}%`,`You need ${points(next.remainingPoints??Number(next.points)-Number(wallet.balance))} for ${num(next.percent)}% off`))}</p></div>`;}
 function pendingReceipt(){return receipt?`<section class="loyalty-notice" role="status"><h2>${E(X('لم تتأكد نتيجة الاستبدال','Exchange outcome is not confirmed'))}</h2><p>${E(X('تحققي من الطلب نفسه قبل بدء استبدال آخر. لن نرسل طلبًا جديدًا.','Check this same request before another exchange. We will not send a new request.'))}</p>${link('loyalty-resume',X('التحقق من النتيجة','Check outcome'))}</section>`:'';}
 function couponSummary(c,compact=false){const available=c.status==='available';return `<article class="loyalty-coupon ${available?'':'is-inactive'}"><div class="loyalty-coupon-heading"><h3>${E(X('خصم','Discount'))} <bdi>${E(num(c.percent))}%</bdi></h3><span>${E(couponStatus(c.status))}</span></div><p>${E(X('بحد أقصى','Up to'))} <bdi>${E(money(c.cap))}</bdi></p>${!compact?codeTag(c.code):''}<p class="loyalty-caption">${E(X('تنتهي في','Expires'))} ${E(date(c.expiresAt))}</p>${available?button('loyalty-use',E(X('استخدمي القسيمة','Use coupon')),{id:c.id}):link('loyalty-coupon-detail',X('تفاصيل القسيمة','Coupon details'),c.id)}</article>`;}
 function overview(){if(!wallet)return shell(X('مكافآتي','My rewards'),statePanel());const available=(wallet.coupons||[]).filter(c=>c.status==='available'),welcome=(wallet.entries||[]).find(e=>e.type==='welcome'&&e.status!=='expired');return shell(X('مكافآتي','My rewards'),`${refreshNotice()}${pendingReceipt()}<section class="loyalty-balance" aria-labelledby="loyalty-balance-title"><h2 id="loyalty-balance-title">${E(X('رصيد النقاط','Points balance'))}</h2><p class="loyalty-balance-number"><bdi>${E(num(wallet.balance))}</bdi><span>${E(X('نقطة','points'))}</span></p>${Number(wallet.pendingPoints)>0?`<p class="loyalty-caption">${E(points(wallet.pendingPoints))} ${E(X('قيد الانتظار','pending'))}</p>`:''}${progress()}${button('nav',E(X('اختاري مكافأتك','Choose your reward')),{id:'reward'})}</section>${Number(wallet.balance)===0?`<section class="loyalty-section"><h2>${E(X('ابدئي من زيارتك القادمة','Start with your next visit'))}</h2><p>${E(X('تُضاف النقاط إلى رصيدك بعد إتمام الزيارة وتسجيل سداد الخدمات المؤهلة.','Points are added after your visit is completed and eligible treatment payment is recorded.'))}</p></section>`:welcome?`<p class="loyalty-welcome">${E(X(`أُضيفت ${points(welcome.points)} ترحيبية بعد التحقق من بريدك`,`You earned ${points(welcome.points)} for verifying your email`))}</p>`:''}${available.length?`<section class="loyalty-section"><div class="loyalty-section-heading"><h2>${E(X('قسائمك الجاهزة','Ready to use'))}</h2>${available.length>1?link('loyalty-coupons',X('عرض الكل','View all')):''}</div>${couponSummary(available[0])}</section>`:''}${referral()}<section class="loyalty-section loyalty-how"><h2>${E(X('عنايتك ترجع لك','Your care earns more'))}</h2><p>${E(earnSummary())}</p>${link('nav',X('كيف تُحتسب المكافآت؟','How rewards work'),'loyalty-terms')}</section>`);}
 function earnSummary(){const rate=rule('pointsPerSar');if(rate===undefined)return X('تُحتسب نقاطك من الخدمات المؤهلة والمدفوعة بعد إتمام الزيارة.','Earn points on eligible paid treatments after your visit is completed.');return Number(rate)===1?X('لكِ نقطة عن كل ريال مدفوع للخدمات المؤهلة. تُضاف النقاط بعد إتمام الزيارة.','Earn one point for every riyal paid for eligible treatments. Points are added after your visit is completed.'):X(`لكِ ${points(rate)} عن كل ريال مدفوع للخدمات المؤهلة. تُضاف النقاط بعد إتمام الزيارة.`,`Earn ${points(rate)} for every riyal paid for eligible treatments. Points are added after your visit is completed.`);}

 function referral(){const code=wallet.referralCode;return `<section class="loyalty-section loyalty-referral"><h2>${E(X('عناية أجمل مع صديقة','Share care with a friend'))}</h2><p>${E(rule('referralPercent')!==undefined?X(`لصديقتك خصم ${num(rule('referralPercent'))}% حتى ${money(rule('referralCap'))} على حجزها المؤهل الأول.`,`Your friend gets ${num(rule('referralPercent'))}% off, up to ${money(rule('referralCap'))}, on her first eligible booking.`):X('شاركي رمز دعوتك مع صديقة لحجزها المؤهل الأول.','Share your code for a friend’s first eligible booking.'))}</p>${code?`<div class="loyalty-referral-code">${codeTag(code)}${link('loyalty-copy-referral',X('نسخ الرمز','Copy code'))}</div>${button('loyalty-share',I('share')+E(X('مشاركة الدعوة','Share invitation')),{cls:'loyalty-button loyalty-button--secondary'})}`:`<p class="loyalty-caption">${E(X('رمز الدعوة غير متاح حاليًا. حدّثي المكافآت للمحاولة مجددًا.','Your referral code is unavailable. Refresh rewards to try again.'))}</p>`}<p class="loyalty-caption">${E(rule('referrerPoints')!==undefined?X(`لك ${points(rule('referrerPoints'))} بعد إتمام صديقتك زيارتها الأولى وسدادها. مشاركة الرمز وحدها لا تضيف نقاطًا.`,`Earn ${points(rule('referrerPoints'))} after your friend’s first visit is completed and paid. Sharing the code alone does not earn points.`):X('لا تُضاف نقاط الدعوة حتى تُكمل صديقتك الزيارة المؤهلة وتسددها.','Referral points are not added until your friend completes and pays for her eligible visit.'))}</p></section>`;}
 function rewards(){if(!wallet)return shell(X('استبدال النقاط','Exchange points'),statePanel());return shell(X('استبدال النقاط','Exchange points'),`${refreshNotice()}${pendingReceipt()}<p class="loyalty-intro">${E(X(`رصيدك ${points(wallet.balance)}. اختاري الخصم المناسب لزيارتك القادمة.`,`Your balance is ${points(wallet.balance)}. Choose a discount for your next visit.`))}</p><div class="loyalty-rewards">${(wallet.rewards||[]).map(r=>`<article class="loyalty-reward"><div><h2><bdi>${E(num(r.percent))}%</bdi> ${E(X('خصم','off'))}</h2><p>${E(X('بحد أقصى','Up to'))} <bdi>${E(money(r.cap))}</bdi></p><p class="loyalty-reward-cost">${E(points(r.points))}</p></div>${button('loyalty-redeem-open',E(r.eligible?X('استبدلي النقاط','Exchange points'):X(`باقي ${points(r.remainingPoints)}`,`${points(r.remainingPoints)} to go`)),{id:r.id,cls:'loyalty-button loyalty-button--secondary',disabled:!r.eligible||!!receipt,extra:`id="reward-${E(r.id)}"`})}</article>`).join('')}</div><p class="loyalty-caption">${E(X('تُخصم النقاط عند تأكيد الاستبدال وتصدر قسيمة واحدة لحسابك. يمكنك مراجعة الشروط قبل التأكيد.','Points are deducted when you confirm the exchange and one coupon is issued to your account. You can review the terms before confirming.'))}</p>${link('nav',X('شروط المكافآت','Reward terms'),'loyalty-terms')}`);}
 function couponStatus(s){return s==='available'?X('متاحة','Available'):s==='used'?X('مستخدمة','Used'):s==='expired'?X('منتهية','Expired'):X('غير متاحة','Unavailable');}
 function entryTitle(e){const map={purchase:['نقاط الخدمات','Treatment points'],'first-visit':['مكافأة الزيارة الأولى','First visit reward'],'third-visit':['مكافأة الزيارة الثالثة','Third visit reward'],'referral-pending':['دعوة صديقة','Friend referral'],manual:['تسوية نقاط','Points adjustment'],welcome:['نقاط التحقق من البريد','Email verification points'],visit:['نقاط الخدمات','Treatment points'],earning:['نقاط الخدمات','Treatment points'],first_visit:['مكافأة الزيارة الأولى','First visit reward'],third_visit:['مكافأة الزيارة الثالثة','Third visit reward'],referral:['دعوة صديقة','Friend referral'],redeem:['استبدال بقسيمة','Coupon exchange'],redemption:['استبدال بقسيمة','Coupon exchange'],expiry:['نقاط انتهت صلاحيتها','Expired points'],expired:['نقاط انتهت صلاحيتها','Expired points'],reversal:['تسوية نقاط','Points adjustment'],adjustment:['تسوية نقاط','Points adjustment']};return map[e.type]?X(...map[e.type]):X('حركة نقاط','Points activity');}
 function entryStatus(s){return s==='pending'?X('قيد الانتظار','Pending'):s==='expired'?X('منتهية','Expired'):s==='reversed'?X('معكوسة','Reversed'):s==='disqualified'?X('غير مؤهلة','Ineligible'):s==='cancelled'?X('ملغاة','Cancelled'):s==='spent'?X('مستبدلة','Exchanged'):s==='confirmed'?X('أُضيفت للرصيد','Added to balance'):X('مسجلة','Recorded');}
 function history(){if(!wallet)return shell(X('سجل المكافآت','Reward history'),statePanel());const entries=(wallet.entries||[]).filter(e=>!(e.type==='referral-pending'&&e.status==='confirmed')),coupons=wallet.coupons||[];return shell(X('سجل المكافآت','Reward history'),`${refreshNotice()}<div class="loyalty-tabs" role="group" aria-label="${E(X('نوع السجل','History type'))}">${[['points',X('النقاط','Points')],['coupons',X('القسائم','Coupons')]].map(([id,label])=>button('loyalty-tab',E(label),{id,cls:'loyalty-tab'+(historyTab===id?' is-active':''),extra:`aria-pressed="${historyTab===id}"`})).join('')}</div>${historyTab==='points'?entries.length?`<div class="loyalty-history-list">${entries.map(e=>button('loyalty-entry',`<span><strong>${E(entryTitle(e))}</strong><small>${E(date(e.createdAt))} · ${E(entryStatus(e.status))}</small></span><bdi class="loyalty-entry-value" dir="ltr">${Number(e.points)>0?'+':''}${E(num(e.points))}</bdi>`,{id:e.id,cls:'loyalty-history-row'})).join('')}</div>`:empty(X('لا توجد حركة نقاط بعد','No points activity yet'),X('ستظهر نقاطك هنا بعد تسجيلها، مع تاريخها وحالتها.','Recorded points will appear here with their date and status.')):coupons.length?`<div class="loyalty-coupon-list">${coupons.map(c=>button('loyalty-coupon-detail',`<span><strong>${E(num(c.percent))}% ${E(X('خصم','off'))}</strong><small>${E(couponStatus(c.status))} · ${E(date(c.expiresAt))}</small></span>${I('chevron')}`,{id:c.id,cls:'loyalty-history-row'})).join('')}</div>`:empty(X('لا توجد قسائم بعد','No coupons yet'),X('استبدلي نقاطك بمكافأة لتجدي قسيمتك هنا.','Exchange points for a reward to find your coupon here.'))}`);}
 function empty(title,body){return `<section class="loyalty-empty"><h2>${E(title)}</h2><p>${E(body)}</p>${link('nav',X('عرض المكافآت','View rewards'),'reward')}</section>`;}
 function couponDetail(){if(!wallet)return shell(X('تفاصيل القسيمة','Coupon details'),statePanel());const c=(wallet.coupons||[]).find(c=>c.id===S().routeId);return shell(X('تفاصيل القسيمة','Coupon details'),c?`${couponSummary(c)}${c.status==='available'?link('loyalty-copy-coupon',X('نسخ رمز القسيمة','Copy coupon code'),c.id):''}<section class="loyalty-section"><h2>${E(X('عند الحجز','When booking'))}</h2><p>${E(X('طبّقي الرمز في مراجعة الحجز. يُحتسب الخصم على الخدمات المؤهلة فقط، ولا يمكن جمعه مع رمز آخر.','Apply the code when reviewing your booking. The discount applies only to eligible treatments and cannot be combined with another code.'))}</p>${link('nav',X('عرض الشروط كاملة','View all terms'),'loyalty-terms')}</section>`:empty(X('لم نعثر على القسيمة','Coupon not found'),X('حدّثي المكافآت أو ارجعي لسجل القسائم.','Refresh rewards or return to coupon history.')));}
 function terms(){if(hasCard())return shell(X('شروط المكافآت','Reward terms'),`<div class="loyalty-terms"><p>${sayText('يُضاف لكِ ختم لما يسجّل فريق كلينيمي حضورك لزيارة باسمك فيها خدمة بمقابل، حتى لو ما سددتِ بعد. الحجوزات المجانية بالكامل ما تضيف أختامًا.','Earn a stamp when the Clinime team records your arrival for a visit in your own name that includes a priced treatment, even before payment. Fully complimentary bookings do not earn stamps.')}</p><p>${sayText('لكل حجز ختم واحد، ويظل محفوظًا إذا تغيّر الموعد أو أُلغي الحجز بعد تسجيل حضورك. لا تُضاف أختام للزيارات السابقة بأثر رجعي. تأكيد الحجز وحده ما يضيف ختمًا.','Each booking earns one stamp, which stays if the appointment changes or the booking is cancelled after your arrival is recorded. Past visits do not receive stamps retroactively. Confirming a booking alone does not earn a stamp.')}</p><p>${sayText('بعد خمسة أختام، لكِ جلسة تنظيف البشرة الأساسي مجانًا؛ احجزيها لنفسك أو أهديها مرة واحدة عبر «مكافآتي» إلى بريد المستفيدة.','Five stamps earn a complimentary Basic Facial. Book it for yourself or gift it once through My rewards using the recipient’s email.')}</p><p>${sayText('عند استخدام رمز الدعوة، يُحتسب رصيد الإحالة لصاحبة الرمز بعد إتمام أول زيارة مؤهلة وسدادها.','A referral credits the inviter after the referred customer completes and pays for her first qualifying visit.')}</p></div>`);if(!wallet)return shell(X('كيف تعمل المكافآت','How rewards work'),statePanel());const lines=[earnSummary()];if(rule('welcomePoints')!==undefined)lines.push(X(`${points(rule('welcomePoints'))} ترحيبية مرة واحدة بعد التحقق من البريد الإلكتروني.`,`${points(rule('welcomePoints'))} once after verifying your email address.`));if(rule('firstVisitPoints')!==undefined)lines.push(X(`${points(rule('firstVisitPoints'))} إضافية بعد الزيارة المؤهلة الأولى، و${points(rule('thirdVisitPoints'))} بعد الثالثة.`,`${points(rule('firstVisitPoints'))} extra after your first eligible visit and ${points(rule('thirdVisitPoints'))} after your third.`));if(rule('referrerPoints')!==undefined)lines.push(X(`نقاط الدعوة (${points(rule('referrerPoints'))}) تبقى قيد الانتظار حتى إتمام صديقتك أول زيارة مؤهلة وسدادها. لا تشمل دعوة الحساب نفسه.`,`Referral points (${points(rule('referrerPoints'))}) remain pending until your friend completes and pays for her first eligible visit. Self-referrals are excluded.`));if(rule('pointExpiryMonths')!==undefined)lines.push(X(`تنتهي صلاحية النقاط بعد ${num(rule('pointExpiryMonths'))} شهرًا من اكتسابها.`,`Points expire ${num(rule('pointExpiryMonths'))} months after earning them.`));if(rule('couponExpiryDays')!==undefined)lines.push(X(`تنتهي صلاحية القسيمة بعد ${num(rule('couponExpiryDays'))} يومًا من إصدارها، ولا تُجمع مع رمز آخر.`,`Coupons expire ${num(rule('couponExpiryDays'))} days after issue and cannot be combined with another code.`));lines.push(X('تُحتسب النقاط على المبلغ المؤهل المدفوع بعد الخصم. لا يكفي إنشاء الحجز أو إلغاؤه لاكتساب النقاط.','Points are based on the eligible amount paid after discount. Creating or cancelling a booking does not earn points.'));lines.push(X('قد تؤدي عمليات الإلغاء أو الاسترجاع أو تصحيح الزيارة إلى تسوية النقاط. الرصيد والسجل المعروضان بعد التحديث هما المرجع.','Cancellation, refunds or visit corrections may adjust points. Your refreshed balance and history show the current record.'));return shell(X('كيف تعمل المكافآت','How rewards work'),`<div class="loyalty-terms">${lines.map(line=>`<p>${E(line)}</p>`).join('')}</div>`);}
 function accountSummary(){identity();return `<section class="loyalty-account-summary">${button('nav',`<span><strong>${E(X('مكافآتي','My rewards'))}</strong><small>${E(wallet?points(wallet.balance):status==='loading'?X('جارٍ تحميل الرصيد…','Loading balance…'):X('النقاط، القسائم ودعوة صديقة','Points, coupons and friend invitations'))}</small></span>${I('chevron')}`,{id:'loyalty',cls:'loyalty-account-link'})}</section>`;}
 function redeemOpen(id){if(receipt){resume();return;}const r=wallet?.rewards?.find(r=>r.id===id);if(!r?.eligible||S().recovery)return;redemptionError='';feedback='';A.openModal('loyalty-redeem',{rewardId:id});}
 function resume(){if(!receipt)return;feedback='';redemptionError=X('لم تتأكد نتيجة الطلب بعد. أعيدي التحقق بالطلب نفسه.','The request outcome is not confirmed. Check the same request again.');A.openModal('loyalty-redeem',{rewardId:receipt.body.rewardId});}
 async function redeem(){if(S().pending||!owner)return;const r=wallet?.rewards?.find(r=>r.id===S().modal?.rewardId);if(!receipt&&!r?.eligible)return;const record=receipt||{owner,body:{requestId:API.uuid(),revision:wallet.revision,rewardId:r.id},reward:{...r}};receipt=record;const g=generation,o=owner,route=S().route;S().pending=true;S().operation='loyalty-redeem';redemptionError='';feedback='';A.render({preserve:true});try{const result=await API.request('/api/loyalty/redeem',{method:'POST',body:record.body});if(!valid(g,o))return;read++;loading=null;wallet=result.wallet;status='ready';receipt=null;redemptionError='';feedback='';S().pending=false;S().operation=null;if(S().modal?.type==='loyalty-redeem'&&S().route===route){A.openModal('loyalty-earned',{coupon:result.coupon});}else{announce(X('أُصدرت قسيمتك. ستجدينها في مكافآتي.','Your coupon is issued. Find it in My rewards.'));paint();}load({refresh:true});}catch(e){if(!valid(g,o))return;S().pending=false;S().operation=null;if(recoverAuth(e))return;redemptionError=e.uncertain?X('لم نتأكد من نتيجة الاستبدال. تحققي مجددًا بالطلب نفسه لتجنب خصم النقاط مرتين.','The exchange outcome is not confirmed. Check the same request again to avoid a second points deduction.'):errorText(e);if(!e.uncertain){receipt=null;if(['LOYALTY_CONFLICT','INSUFFICIENT_POINTS'].includes(e.code))load({refresh:true});}if(S().modal?.type==='loyalty-redeem'){feedback='';speak(redemptionError);}else announce(redemptionError);paint();}}
 function modal(){const m=S().modal;if(!m?.type?.startsWith('loyalty'))return'';let title='',body='',actions='';if(m.type==='loyalty-redeem'){const r=receipt?.reward||wallet?.rewards?.find(r=>r.id===m.rewardId);if(!r)return'';title=X('استبدال نقاطك بقسيمة؟','Exchange points for a coupon?');body=`<p class="loyalty-sheet-reward"><bdi>${E(num(r.percent))}%</bdi> ${E(X('خصم','off'))}</p><p>${E(X('بحد أقصى','Up to'))} <bdi>${E(money(r.cap))}</bdi></p><dl class="loyalty-sheet-facts"><div><dt>${E(X('تكلفة الاستبدال','Exchange cost'))}</dt><dd>${E(points(r.points))}</dd></div><div><dt>${E(X('الرصيد بعد الاستبدال','Balance after exchange'))}</dt><dd>${E(points(Math.max(0,Number(wallet.balance)-Number(r.points))))}</dd></div></dl><p class="loyalty-caption">${E(rule('couponExpiryDays')!==undefined?X(`تُصدر قسيمة لحسابك صالحة ${num(rule('couponExpiryDays'))} يومًا. تُطبق على الخدمات المؤهلة ولا تُجمع مع رمز آخر.`,`One coupon is issued to your account for ${num(rule('couponExpiryDays'))} days. It covers eligible treatments and cannot be combined with another code.`):X('تُطبق القسيمة على الخدمات المؤهلة ولا تُجمع مع رمز آخر.','The coupon covers eligible treatments and cannot be combined with another code.'))}</p>${redemptionError?`<p class="loyalty-error" role="alert">${E(redemptionError)}</p>`:''}`;actions=button('loyalty-redeem-confirm',E(S().pending?X('جارٍ التحقق…','Checking…'):receipt?X('التحقق من النتيجة','Check outcome'):X('تأكيد الاستبدال','Confirm exchange')),{disabled:S().pending,extra:S().pending?'aria-busy="true"':''})+link('close-modal',receipt?X('العودة للمكافآت','Back to rewards'):X('ليس الآن','Not now'));}else if(m.type==='loyalty-earned'){const c=m.coupon;title=X('قسيمتك جاهزة','Your coupon is ready');body=`<p>${E(X('خُصمت النقاط وأُضيفت القسيمة إلى حسابك.','Points were deducted and the coupon was added to your account.'))}</p>${codeTag(c.code)}<p class="loyalty-sheet-reward"><bdi>${E(num(c.percent))}%</bdi> ${E(X('خصم','off'))}</p><p>${E(X('حتى','Up to'))} <bdi>${E(money(c.cap))}</bdi></p><p class="loyalty-caption">${E(X('صالحة حتى','Valid until'))} ${E(date(c.expiresAt))}</p>`;actions=button('loyalty-use',E(X('استخدمي القسيمة','Use coupon')),{id:c.id})+link('loyalty-copy-coupon',X('نسخ الرمز','Copy code'),c.id);}else if(m.type==='loyalty-entry'){const e=m.entry;title=entryTitle(e);body=`<dl class="loyalty-sheet-facts"><div><dt>${E(X('النقاط','Points'))}</dt><dd><bdi dir="ltr">${Number(e.points)>0?'+':''}${E(num(e.points))}</bdi></dd></div><div><dt>${E(X('الحالة','Status'))}</dt><dd>${E(entryStatus(e.status))}</dd></div><div><dt>${E(X('التاريخ','Date'))}</dt><dd>${E(date(e.createdAt))}</dd></div>${e.expiresAt?`<div><dt>${E(X('انتهاء الصلاحية','Expiry'))}</dt><dd>${E(date(e.expiresAt))}</dd></div>`:''}</dl>${e.description?`<p>${E(e.description)}</p>`:''}${e.reason==='another-eligible-visit-completed-first'?`<p>${E(X('اكتملت زيارة مؤهلة أخرى أولًا.','Another eligible visit was completed first.'))}</p>`:''}${e.status==='disqualified'?`<p>${E(X('لم تُضف نقاط لهذه الدعوة لأنها غير مؤهلة للمكافأة.','No points were added for this invitation because it is ineligible for the reward.'))}</p>`:''}${e.status==='pending'?`<p>${E(X('لا يمكن استبدال هذه النقاط حتى تكتمل الزيارة المؤهلة ويُسجل سدادها.','These points cannot be exchanged until the eligible visit is completed and payment is recorded.'))}</p>`:''}`;actions=link('close-modal',X('العودة للسجل','Back to history'));}else if(m.type==='loyalty-copy'){title=m.isLink?X('انسخي رابط الدعوة','Copy invitation link'):X('انسخي الرمز','Copy code');body=`<p>${E(X('تعذّر النسخ التلقائي. حددي الرمز وانسخيه يدويًا.','Automatic copying was unavailable. Select the code and copy it manually.'))}</p><label class="loyalty-caption" for="loyalty-manual-code">${E(m.isLink?X('الرابط','Link'):X('الرمز','Code'))}</label><input id="loyalty-manual-code" class="loyalty-manual-code" readonly dir="ltr" value="${E(m.code)}">`;actions=link('close-modal',X('إغلاق','Close'));}return `<dialog id="active-dialog" class="app-dialog loyalty-dialog" aria-labelledby="dialog-title"><div class="dialog-header"><h2 id="dialog-title">${E(title)}</h2>${button('close-modal',I('close'),{cls:'loyalty-icon',extra:`aria-label="${E(X('إغلاق','Close'))}"`})}</div><div class="loyalty-dialog-body">${body}${feedbackMarkup()}</div><div class="loyalty-dialog-actions">${actions}</div></dialog>`;}
 async function copy(code){if(!code)return;const g=generation,o=owner;try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(code);if(!valid(g,o))return;announce(X('نُسخ الرمز','Code copied'));paint();}catch(_){if(valid(g,o))A.openModal('loyalty-copy',{code});}}
 async function share(){if(!wallet?.referralCode)return;const g=generation,o=owner,text=X(`رمز دعوتي في كلينيمي: ${wallet.referralCode}. استخدميه عند مراجعة حجزك المؤهل الأول.`,`My Clinime invitation code: ${wallet.referralCode}. Apply it when reviewing your first eligible booking.`);if(navigator.share){try{await navigator.share({title:'Clinime',text});if(valid(g,o)){announce(X('أُغلقت نافذة المشاركة. تُضاف نقاطك بعد زيارة صديقتك المؤهلة وسدادها.','The share window closed. Points are earned after your friend’s eligible visit is completed and paid.'));paint();}return;}catch(e){if(e.name==='AbortError')return;}}if(valid(g,o))copy(wallet.referralCode);}
 function useCoupon(id){if(S().recovery)return;feedback='';if(S().draft?.mode==='edit'){S().notice=X('القسيمة لحجز جديد. أكملي تعديل موعدك الحالي أو ألغيه أولًا، ثم عودي لاستخدام القسيمة.','This coupon is for a new booking. Finish or discard your current appointment edit, then return to use the coupon.');A.go('review',null,{notice:true});return;}const c=(wallet?.coupons||[]).find(c=>c.id===id)||S().modal?.coupon;if(!c||c.status!=='available')return;promo={...promo,input:c.code,code:c.code,status:'stale',quote:null,error:'',itemsKey:'',sequence:promo.sequence+1};S().modal=null;announce(X('أُضيف الرمز للحجز. اختاري خدماتك لتأكيد الخصم في المراجعة.','Code added to your booking. Choose treatments to confirm the discount during review.'));S().category='all';S().query='';A.go('services');}
 const itemsKey=()=>JSON.stringify(S().cart.map(c=>[c.serviceId,c.optionId||null]));
 function cartChanged(){if(promo.code){promo.status='stale';promo.quote=null;promo.error='';promo.sequence++;}}
 async function applyPromotion(raw=promo.input){if(S().recovery||S().draft?.mode==='edit'||S().pending||promo.status==='loading')return;identity();const code=String(raw||'').trim().toUpperCase();promo.input=code;if(invitation?.code&&code!==invitation.code)forgetInvite();if(!code){promo.error=X('أدخلي رمز القسيمة أو الدعوة','Enter a coupon or referral code');promo.status='error';paint();return;}const g=generation,o=owner,n=++promo.sequence,key=itemsKey(),draftId=S().draft?.id;promo.code=code;promo.quote=null;promo.status='loading';promo.error='';paint();try{const q=await API.request('/api/loyalty/quote',{method:'POST',body:{items:S().cart.map(c=>({serviceId:c.serviceId,optionId:c.optionId||null})),code}});if(!valid(g,o)||n!==promo.sequence||draftId!==S().draft?.id||key!==itemsKey())return;promo.quote=q;promo.code=q.code||code;promo.input=promo.code;promo.itemsKey=key;promo.status='ready';promo.requiresRequote=false;announce(kindLabel(q));}catch(e){if(!valid(g,o)||n!==promo.sequence)return;if(recoverAuth(e))return;promo.status='error';promo.quote=null;promo.error=errorText(e);announce(promo.error);}paint();}
 function reviewPromotion(){if(S().draft?.mode==='edit')return'';const locked=!!S().recovery,ready=promo.status==='ready'&&promo.itemsKey===itemsKey();return `<section class="loyalty-promotion" aria-labelledby="promotion-title"><h2 id="promotion-title">${E(X('قسيمة أو رمز دعوة','Coupon or referral code'))}</h2>${!ready?`<form data-form="loyalty-promotion" novalidate><label for="promotion-code">${E(X('الرمز','Code'))}</label><div class="loyalty-promotion-field"><input id="promotion-code" name="promotionCode" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="48" value="${E(promo.input)}" ${locked?'disabled':''} ${promo.error?'aria-invalid="true" aria-describedby="promotion-error"':''}><button type="submit" class="loyalty-button loyalty-button--secondary" ${locked||promo.status==='loading'?'disabled':''}>${E(promo.status==='loading'?X('جارٍ التحقق…','Checking…'):X('تطبيق','Apply'))}</button></div>${promo.error?`<p id="promotion-error" class="loyalty-error" role="alert">${E(promo.error)}</p>`:''}</form>`:''}${ready?`<div class="loyalty-promotion-applied"><p>${I('check')}${E(X('الرمز مطبّق','Code applied'))} ${codeTag(promo.quote.code)}</p>${link('loyalty-promotion-remove',X('إزالة','Remove'),'',locked?'disabled':'')}</div><p class="loyalty-caption">${E(X('الخصم على خدمات مؤهلة بقيمة','Discount on eligible treatments worth'))} <bdi>${E(money(promo.quote.eligibleSubtotal))}</bdi> · ${E(num(promo.quote.percent))}% ${E(X('حتى','up to'))} <bdi>${E(money(promo.quote.cap))}</bdi></p>`:promo.code||promo.input.trim()?`<div class="loyalty-promotion-applied"><p class="loyalty-caption">${E(promo.status==='loading'?X('نتحقق من الرمز قبل تأكيد السعر','Checking the code before confirming the price'):X('أعيدي تطبيق الرمز أو أزيليه قبل تأكيد الحجز','Apply the code again or remove it before confirming'))}</p>${link('loyalty-promotion-remove',X('إزالة الرمز','Remove code'),'',locked?'disabled':'')}</div>`:''}<p class="loyalty-caption">${E(X('رمز واحد لكل حجز. نؤكد القيمة النهائية عند حفظ الموعد، ولا يُحصّل أي مبلغ هنا.','One code per booking. The final amount is confirmed when saving the appointment. No payment is collected here.'))}</p></section>`;}
 // The Clinime visit card and referral wallet are separate instruments.
 const hasCard = () => Boolean(wallet?.stampCard);
 const card = () => wallet.stampCard;
 const availableFacials = () => (card().rewards || []).filter(r => r.status === 'available');
 const rewardName = () => X('جلسة تنظيف البشرة الأساسي','Basic Facial');
 const sayText = (ar,en) => E(X(ar,en));
 const actionLabel = (action,ar,en,options) => button(action,sayText(ar,en),options);
 const referralAddress = () => {
   const url = new URL('/', location.origin);
   url.searchParams.set('ref',wallet.referralCode);
   url.hash='/home';
   return url.href;
 };
 const inviteKey='clinime-pending-invite-v1';
 function readInvite() {
   try {return JSON.parse(sessionStorage.getItem(inviteKey)||'null');} catch {return null;}
 }
 let invitation=readInvite();
 const validReferral=code=>typeof code==='string'&&/^REF-[A-Z0-9-]{3,44}$/i.test(code);
 if(!validReferral(invitation?.code))invitation=null;
 function storeInvite(value) {
   invitation=value;
   try{if(value)sessionStorage.setItem(inviteKey,JSON.stringify(value));else sessionStorage.removeItem(inviteKey);}catch{/* Session storage may be disabled. */}
 }
 function forgetInvite(){storeInvite(null);}
 function bindInvite(userId) {
   if(!invitation)return;
   if(invitation.owner&&invitation.owner!==userId){forgetInvite();return;}
   storeInvite({code:invitation.code,owner:userId});
 }
 const initialInvite=new URL(location.href).searchParams.get('ref');
 if(validReferral(initialInvite)) {
   storeInvite({code:initialInvite.toUpperCase(),owner:null});
   const clean=new URL(location.href);
   clean.searchParams.delete('ref');
   window.history.replaceState(window.history.state,'',clean);
 }
 let giftEmail = '', giftError = '', giftRequest = null;
 function clearProgramState() {
   giftEmail=''; giftError=''; giftRequest=null;
   historyTab='visits';
   resetWalletRegistration();
 }
 function enterProgram(route) {
   if (route==='review' && owner && invitation?.code && !promo.code && !S().recovery && S().draft?.mode!=='edit') {
     promo.input=invitation.code; promo.code=invitation.code; promo.status='stale';
   }
 }
 function flower(open=false) {
   const petals=[[-75,'#B3CEDC'],[75,'#9EBECB'],[-50,'#E9B7C8'],[50,'#DDA8BD'],[-26,'#CCDCE8'],[26,'#EED4E0'],[0,'#FAE7EF']];
   return '<svg class="visit-flower'+(open?' is-open':'')+'" viewBox="0 0 120 95" aria-hidden="true" focusable="false"><path d="M60 71q-5 9-2 18" fill="none" stroke="#89A2AB" stroke-width="1.4"/>'+petals.map(([degrees,color])=>`<g style="--open:${degrees}deg;--bud:${degrees*.25}deg"><path d="M60 71C42 65 43 47 51 34q8-12 9-23 1 11 9 23c8 13 9 31-9 37Z" fill="${color}" stroke="#FFF8FB" stroke-width=".8"/><path d="M60 68q-3-25 0-50" stroke="#fff" opacity=".6" fill="none" stroke-width=".8"/></g>`).join('')+'</svg>';
 }
 function visitCount(n) {
   if (S().locale!=='ar') return `${num(n)} ${n===1?'visit':'visits'}`;
   return n===1?'زيارة واحدة':n===2?'زيارتان':`${num(n)} زيارات`;
 }
 function visitProgress() {
   const c=card(), target=c.target, filled=c.stamps, remaining=target-filled;
   return `<section class="visit-pass" aria-label="${sayText('بطاقة الزيارات','Visit card')}">
     <div class="visit-pass-head"><span>${sayText('بطاقة الزيارات','Visit card')}</span><img src="${E(ASSETS.logo)}" alt="Clinime"></div>
     <h2>${sayText('جلسة عناية مجانية','A facial, on us')}</h2>
     <p>${sayText('مع كل خمسة أختام','With every five stamps')}</p>
     <p class="loyalty-caption">${sayText('ختم لكل زيارة مؤهلة لما يسجّل فريق كلينيمي حضورك.','One stamp per eligible visit when the Clinime team records your arrival.')}</p>
     <div class="stamp-track" role="img" aria-label="${E(X(`${num(filled)} من ${num(target)} أختام`,`${filled} of ${target} stamps`))}">${Array.from({length:target},(_,i)=>`<span class="stamp-slot ${i<filled?'is-earned':''}" aria-hidden="true">${i<filled?'<svg viewBox="0 0 50 50"><path d="M37.374 12.626A17.5 17.5 0 1 0 37.374 37.374" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="42" cy="25" r="3.75" fill="#FFD8EB"/></svg>':num(i+1)}</span>`).join('')}</div>
     <div class="stamp-balance"><strong>${E(X(`${num(filled)} من ${num(target)}`,`${filled} of ${target}`))}</strong><span>${E(remaining===0?X('اكتملت البطاقة','Card completed'):X(`المتبقي للمكافأة: ${visitCount(remaining)}`,`${visitCount(remaining)} to your next facial`))}</span></div>
   </section>`;
 }
 function platformWallet() {
   const ua=navigator.userAgent;
   if(/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return 'Apple Wallet';
   return /Android/i.test(ua)?'Google Wallet':null;
 }
 // This public enrollment URL issues a separate Loopy pass. Never substitute a member's private pass URL.
 let enrollment = null;
 let walletRegistration={campaign:null,receipt:{status:'none'},phase:'idle',name:'',accepted:false,error:'',field:'',requestId:null,request:null,attempted:false,canEnroll:true};
 const customWalletEnrollment=()=>enrollment?.customEnrollment===true||(enrollment?.localEnrollment===true&&['localhost','127.0.0.1','[::1]'].includes(location.hostname));
 function resetWalletRegistration(){walletRegistration={campaign:null,receipt:{status:'none'},phase:'idle',name:'',accepted:false,error:'',field:'',requestId:null,request:null,attempted:false,canEnroll:true};}
 function setWalletEnrollment(info) {
   enrollment = null;
   if (info?.kind === 'public-loopy-campaign' && /^https:\/\/loyalty\.is\/[A-Za-z0-9_-]+$/.test(info.url)) {
     enrollment = info;
   }
   document.querySelectorAll('[data-wallet-surface]').forEach(slot => {
     slot.innerHTML = walletContents(slot.dataset.walletSurface);
   });
   if(customWalletEnrollment()&&S().route==='wallet-start'&&S().auth?.id)loadWalletRegistration();
 }
 function walletIcon() {
   return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M3 9h18m-14 6h5"/></svg>';
 }
 const walletOffer = {
   name:'عناية بشرة مجانية',
   text:'بعد الزيارة الخامسة، لكِ جلسة تنظيف البشرة الأساسي مجانًا. احجزيها لنفسك أو أهديها.',
   terms:"يُضاف لكِ ختم لما يسجّل فريق كلينيمي حضورك لزيارة باسمك فيها خدمة بمقابل، حتى لو ما سددتِ بعد. الحجوزات المجانية بالكامل ما تضيف أختامًا. لكل حجز ختم واحد، ويظل محفوظًا إذا تغيّر الموعد أو أُلغي الحجز بعد تسجيل حضورك. لا تُضاف أختام للزيارات السابقة بأثر رجعي. بعد خمسة أختام، لكِ جلسة تنظيف البشرة الأساسي مجانًا؛ احجزيها لنفسك أو أهديها مرة واحدة عبر «مكافآتي» في كلينيمي إلى بريد المستفيدة. تأكيد الحجز وحده ما يضيف ختمًا."
 };
 const configuredFacialOffer=()=>enrollment?.target===5&&enrollment.rewardKind==='complimentary-service'&&enrollment.serviceId==='basic'&&enrollment.giftable===true;
 function walletTerms() {
   if(customWalletEnrollment()?!walletReward().aligned:!configuredFacialOffer())return X('راجعي شروط البطاقة لمعرفة مكافأتها وطريقة استخدامها.','Review the card terms for its reward and how to use it.');
   return X('احجزي جلسة المكافأة لنفسك أو أهديها مرة واحدة من «مكافآتي» في كلينيمي.','Book your reward facial for yourself or gift it once through My rewards in Clinime.');
 }
 function walletCampaignTerms(){
   const terms=walletRegistration.campaign?.terms||'';
   return terms===walletOffer.terms?X(terms,"Earn a stamp when the Clinime team records your arrival for a visit in your own name that includes a priced treatment, even before payment. Fully complimentary bookings do not earn stamps. Each booking earns one stamp, which stays if the appointment changes or the booking is cancelled after your arrival is recorded. Past visits do not receive stamps retroactively. Five stamps earn a complimentary Basic Facial. Book it for yourself or gift it once through My rewards in Clinime using the recipient’s email. Confirming a booking alone does not earn a stamp."):terms;
 }
 function walletContents(surface) {
   if (surface==='start') return walletStartContent();
   const bookingStatus=surface==='confirmation'?walletBookingStatus():'';
   const provider=platformWallet();
   if(!enrollment){
     if(surface==='card')return '<p class="wallet-wait">'+sayText('بطاقتك محفوظة في كلينيمي. الإضافة إلى محفظة الجوال غير متاحة حاليًا.','Your visit card is saved in Clinime. Mobile wallet enrollment is currently unavailable.')+'</p>';
     return surface==='confirmation'?bookingStatus+programRow('visit-card',I('grid'),X('بطاقة زياراتي','My visit card'),X('عرض أختامك في كلينيمي','View your stamps in Clinime')):'';
   }
   const label=provider?X('أضيفي بطاقتك إلى '+provider,'Add your card to '+provider):X('أضيفي بطاقتك إلى محفظة الجوال','Add your card to your mobile wallet');
   return bookingStatus+'<section class="wallet-invitation"><span class="wallet-invitation-mark" aria-hidden="true">'+walletIcon()+'</span><div><h2>'+sayText('العناية أقرب، والبطاقة معكِ','Your care. Your card. Always with you.')+'</h2><p>'+sayText('أضيفي بطاقة كلينيمي، واعرضيها عند زيارتك.','Add your Clinime card and show it at your visit.')+'</p></div>'+button('nav',E(label)+I('arrow'),{id:'wallet-start',cls:'wallet-join-action'})+'</section>';
 }
 function walletBookingStatus(){
   const sync=A.currentBooking?.()?.walletSync;
   const messages={synced:['أُرسل تحديث الموعد للبطاقة','The appointment update was sent to your card'],pending:['تحديث البطاقة قيد الإرسال','Your card update is pending'], 'waiting-for-card':['أضيفي بطاقتك ليصلك تحديث الموعد','Add your card to receive the appointment update'],unknown:['جارٍ التحقق من تحديث البطاقة','Checking your card update'],failed:['تعذّر إرسال تحديث الموعد للبطاقة. حدّثي الحالة أو تواصلي مع الاستقبال.','The appointment update could not be sent to your card. Refresh the status or contact reception.']};
   if(!messages[sync?.status])return '';
   return '<div class="wallet-booking-status"><p class="loyalty-caption" role="status">'+E(X(...messages[sync.status]))+'</p>'+(['pending','unknown','failed'].includes(sync.status)?link('refresh-account',X('تحديث حالة البطاقة','Refresh card status'),'',S().sessionStatus==='loading'?'disabled aria-busy="true"':''):'')+'</div>';
 }
 function walletStart() {
   return shell(customWalletEnrollment()?X('بطاقة كلينيمي','Your Clinime card'):X('بطاقتك، معكِ دائمًا.','Your care, to keep.'),'<div data-wallet-surface="start">'+walletStartContent()+'</div>');
 }
 function walletStartContent() {
   if(customWalletEnrollment())return walletRegistrationContent();
   if(!enrollment)return '<section class="wallet-start"><p class="wallet-wait">'+sayText('الإضافة إلى محفظة الجوال غير متاحة حاليًا. بطاقتك ومكافآتك محفوظة في كلينيمي.','Mobile wallet enrollment is currently unavailable. Your visit card and rewards are saved in Clinime.')+'</p>'+button('nav',sayText('العودة لمكافآتي','Back to my rewards'),{id:'loyalty'})+'</section>';
   const provider=platformWallet();
   const label=provider?X('متابعة إلى '+provider,'Continue to '+provider):X('أكملي إضافة البطاقة','Continue to add your card');
   const elapsed=Math.min(650,Math.max(0,performance.now()-walletIntroAt));
   const marks=Array.from({length:5},(_,i)=>'<span class="wallet-art-stamp" style="animation-delay:'+(-elapsed+120+i*45)+'ms"></span>').join('');
   const qr=!provider && enrollment.qr==='/__local/wallet-enrollment.png'?'<div class="wallet-start-qr"><img src="/__local/wallet-enrollment.png" width="92" height="92" alt=""><p>'+sayText('تفتحين الموقع من اللابتوب؟','On your laptop?')+'<span>'+sayText('امسحي الرمز بكاميرا جوالك لإضافة البطاقة.','Scan this code with your phone to add the card.')+'</span></p></div>':'';
   return '<section class="wallet-start"><p class="wallet-start-intro">'+sayText('أضيفيها مرة واحدة، واعرضيها عند الاستقبال.','Add it once. Keep it close at every visit.')+'</p>'+ 
     '<div class="wallet-stage" style="--wallet-entry-delay:'+(-elapsed)+'ms"><div class="wallet-pocket" aria-hidden="true"></div>'+ 
       '<button type="button" class="wallet-art-card'+(walletFlipped?' is-flipped':'')+'" data-action="wallet-flip" aria-pressed="'+walletFlipped+'" aria-label="'+E(X('اقلبي البطاقة لعرض طريقة استخدامها','Turn the card to learn how to use it'))+'">'+
       '<span class="wallet-art-turn"><span class="wallet-art-front"><span class="wallet-art-brand"><img src="'+E(ASSETS.logo)+'" alt=""><span>NOTHING MAJOR</span></span>'+ 
       '<span class="wallet-art-name">'+sayText('عنايتك ترجع لكِ.','Your care gives back.')+'</span><span class="wallet-art-stamps" aria-hidden="true">'+marks+'</span>'+ 
       '<span class="wallet-art-reward">'+E(configuredFacialOffer()?X('٥ زيارات · عناية بشرة مجانية','5 visits · Free Basic Facial'):X('بطاقة زيارات كلينيمي','Clinime visit card'))+'</span></span>'+ 
       '<span class="wallet-art-back"><span class="wallet-art-brand"><img src="'+E(ASSETS.logo)+'" alt=""></span><span class="wallet-art-scan" aria-hidden="true">'+walletIcon()+'</span><span class="wallet-art-back-title">'+sayText('افتحي. اعرضي. استمتعي.','Open. Show. Enjoy.')+'</span><span class="wallet-art-back-copy">'+E(configuredFacialOffer()?X('اعرضي البطاقة عند الاستقبال. احجزي مكافأتك أو أهديها من «مكافآتي».','Show your card at reception. Book or gift your reward through My rewards.'):X('افتحي البطاقة من محفظة جوالك واعرضيها عند الاستقبال.','Open your card from your phone wallet and show it at reception.'))+'</span></span></span></button></div>'+ 
     '<p class="wallet-flip-hint">'+I('refresh')+sayText('اضغطي على البطاقة لتقلبيها','Tap the card to turn it over')+'</p>'+ 
     '<div class="wallet-start-copy"><h2>'+sayText('خطوتان، وتصير معك.','Two steps. Then it is yours.')+'</h2><ol><li><span>1</span><div><strong>'+sayText('افتحي رابط البطاقة','Open your card link')+'</strong><p>'+sayText('ننتقل معك إلى Loopy. أول مرة قد يُطلب اسمك وبريدك.','Continue to Loopy. The first time, you may be asked for your name and email.')+'</p></div></li><li><span>2</span><div><strong>'+sayText('أضيفيها إلى المحفظة','Add it to your wallet')+'</strong><p>'+E(provider?X('اختاري الإضافة إلى '+provider+'، وتبقى البطاقة معك.','Choose Add to '+provider+' to keep the card with you.'):X('اختاري Apple Wallet أو Google Wallet على جوالك.','Choose Apple Wallet or Google Wallet on your phone.'))+'</p></div></li></ol></div>'+ 
     '<a class="wallet-start-continue" href="'+E(enrollment.url)+'" rel="external noopener noreferrer">'+walletIcon()+'<span>'+E(label)+'</span>'+I('arrow')+'</a>'+ 
     '<p class="wallet-start-disclosure">'+E(walletTerms())+'</p>'+qr+'</section>';
 }
 async function loadWalletRegistration(){
   identity();if(!owner||!customWalletEnrollment()||walletRegistration.request)return;
   const g=generation,o=owner,registration=walletRegistration;
   if(!registration.name)registration.name=S().auth?.name||'';
   registration.phase=registration.campaign?'refreshing':'loading';registration.error='';paint();
   const task=(async()=>{try{
     const result=await API.request('/api/wallet/campaign');
     if(!valid(g,o)||registration!==walletRegistration)return;
     const changed=registration.campaign?.version&&registration.campaign.version!==result.campaign?.version;
     registration.campaign=result.campaign;
     registration.receipt=walletEnrollmentReceipt(result.enrollment);
     if(registration.receipt.status==='none'&&registration.receipt.retryAllowed===true){registration.attempted=false;registration.requestId=null;registration.error=walletEnrollmentError(registration.receipt);}
     registration.canEnroll=result.canEnroll!==false;
     if(changed)registration.accepted=false;
     registration.phase=registration.campaign||registration.receipt.status!=='none'?'ready':'error';
     if(registration.phase==='error')registration.error=X('تفاصيل البطاقة غير متاحة الآن. حاولي تحديثها.','Card details are unavailable right now. Try refreshing.');
   }catch(e){
     if(!valid(g,o)||registration!==walletRegistration)return;
     if(recoverAuth(e))return;
     registration.phase='error';registration.error=X('تعذّر تحميل حالة البطاقة. تحققي من الاتصال وحاولي تحديثها.','We could not load your card status. Check your connection and refresh.');
   }finally{if(valid(g,o)&&registration===walletRegistration){registration.request=null;paint();}}})();
   registration.request=task;return task;
 }
 function walletReward(){
   const reward=walletRegistration.campaign?.rewards?.[0];
   if(!reward)return {target:0,title:X('بطاقة كلينيمي','Your Clinime card'),description:X('عنايتك، معكِ دائمًا.','Your care, always with you.')};
   // Translate only the reviewed provider contract. A changed live offer remains verbatim.
   const aligned=walletRegistration.campaign.rewards.length===1&&reward.stampsRequired===5&&reward.rewardName===walletOffer.name&&reward.rewardText===walletOffer.text&&walletRegistration.campaign.terms===walletOffer.terms;
   return {aligned,target:Number(reward.stampsRequired)||0,title:aligned?X(walletOffer.name,'Free Basic Facial'):String(reward.rewardName||''),description:aligned?X('بعد الزيارة الخامسة · لنفسك أو هدية','After visit five. Book it or gift it.'):String(reward.rewardText||'')};
 }
 function walletRegistrationCard(){
   const reward=walletReward(),elapsed=Math.min(650,Math.max(0,performance.now()-walletIntroAt));
   const marks=Array.from({length:Math.min(12,reward.target)},(_,i)=>'<span class="wallet-art-stamp" style="animation-delay:'+(-elapsed+120+i*45)+'ms"><span>'+E(num(i+1))+'</span></span>').join('');
   return '<div class="wallet-registration-visual" style="--wallet-entry-delay:'+(-elapsed)+'ms"><button type="button" class="wallet-art-card wallet-registration-card'+(walletFlipped?' is-flipped':'')+'" data-action="wallet-flip" aria-pressed="'+walletFlipped+'" aria-label="'+E(X('اقلبي البطاقة لمعرفة طريقة استخدامها','Turn the card to learn how to use it'))+'"><span class="wallet-art-turn">'+
     '<span class="wallet-art-front"><span class="wallet-art-brand"><img src="'+E(ASSETS.logo)+'" alt="Clinime"><span>'+sayText('بطاقة الزيارات','Visit card')+'</span></span><strong class="wallet-registration-offer">'+E(reward.title)+'</strong><span class="wallet-registration-description">'+E(reward.description)+'</span><span class="wallet-art-stamps" aria-hidden="true">'+marks+'</span></span>'+
     '<span class="wallet-art-back"><span class="wallet-art-brand"><img src="'+E(ASSETS.logo)+'" alt=""></span><span class="wallet-art-back-title">'+sayText('معكِ في كل زيارة.','With you at every visit.')+'</span><span class="wallet-art-back-copy">'+E(reward.aligned?X('اعرضي البطاقة عند الاستقبال. احجزي مكافأتك أو أهديها من «مكافآتي».','Show your card at reception. Book or gift your reward through My rewards.'):X('اعرضي البطاقة عند الاستقبال، وراجعي شروطها لطريقة الاستخدام.','Show your card at reception and review its terms for how to use it.'))+'</span></span></span></button><span class="wallet-registration-hint">'+I('refresh')+sayText('اقلبي البطاقة','Turn the card')+'</span></div>';
 }
 function walletRegistrationContent(){
   const r=walletRegistration,hasCampaign=!!r.campaign,receiptStatus=r.receipt?.status||'none';
   const blocked=['pending','unknown'].includes(receiptStatus)||r.attempted&&receiptStatus==='none';
   const issued=receiptStatus==='issued'&&safeWalletPassURL(r.receipt.url);
   if(!hasCampaign&&!blocked&&!issued)return '<section class="wallet-start wallet-registration"><div class="wallet-registration-loading" '+(r.phase!=='error'?'aria-busy="true"':'')+'><span class="wallet-loading-card" aria-hidden="true"></span><p role="status">'+E(r.phase==='error'?r.error:X('نحمّل تفاصيل بطاقتك…','Loading your card details…'))+'</p>'+(r.phase==='error'?actionLabel('wallet-registration-refresh','إعادة المحاولة','Try again',{cls:'wallet-registration-refresh'}):'')+'</div></section>';
   let content='';
   if(issued){
     const provider=platformWallet();
     const label=provider?X('إضافة إلى '+provider,'Add to '+provider):X('فتح بطاقتك وإضافتها للمحفظة','Open your card and add it to your wallet');
     content='<div class="wallet-registration-result" role="status"><div class="wallet-result-heading">'+I('check')+'<h2>'+sayText('بطاقتك جاهزة.','Your card is ready.')+'</h2></div><p>'+sayText('باقي خطوة: افتحي بطاقتك واختاري إضافتها إلى محفظة الجوال.','One step left: open your card and choose to add it to your phone wallet.')+'</p><a class="wallet-start-continue" href="'+E(r.receipt.url)+'" rel="external noopener noreferrer">'+walletIcon()+'<span>'+E(label)+'</span>'+I('arrow')+'</a><p class="wallet-registration-note">'+sayText('يمكنك الرجوع هنا لفتح البطاقة نفسها في أي وقت.','Return here any time to open the same card.')+'</p></div>';
   }else if(blocked){
     const pending=receiptStatus==='pending'||r.phase==='submitting';
     content='<div class="wallet-registration-result" role="status" '+(pending?'aria-busy="true"':'')+'><div class="wallet-result-heading">'+(pending?'<span class="wallet-registration-spinner" aria-hidden="true"></span>':walletIcon())+'<h2>'+E(pending?X('نجهّز بطاقتك','Preparing your card'):X('نتحقق من إصدار بطاقتك','Checking your card issuance'))+'</h2></div><p>'+E(pending?X('وصل طلبك. حدّثي الحالة بعد لحظات لفتح بطاقتك.','Your request was received. Refresh the status shortly to open your card.'):X('لم يصلنا رابط البطاقة بعد. لن نرسل طلبًا آخر حتى لا تتكرر بطاقتك. حدّثي الحالة أو تواصلي مع الاستقبال.','We have not received your card link yet. We will not submit another request, to avoid a duplicate card. Refresh the status or contact reception.'))+'</p>'+actionLabel('wallet-registration-refresh',r.phase==='refreshing'?'جارٍ التحقق…':'تحديث حالة البطاقة',r.phase==='refreshing'?'Checking…':'Refresh card status',{cls:'wallet-registration-refresh',disabled:!!r.request||['submitting','refreshing'].includes(r.phase)})+'</div>';
   }else{
     const busy=r.phase==='submitting';
     content='<form class="wallet-registration-form" data-form="wallet-registration" novalidate aria-busy="'+busy+'"><div class="wallet-registration-form-heading"><h2>'+sayText('خلّي بطاقتك أقرب.','Keep your card close.')+'</h2><p>'+sayText('أكّدي اسمك، ونجهّزها لمحفظة جوالك.','Confirm your name. We will prepare your card for your phone wallet.')+'</p></div>'+
       '<div class="wallet-registration-field"><label for="wallet-card-name">'+sayText('الاسم على البطاقة','Name on your card')+'</label><input id="wallet-card-name" name="walletCardName" autocomplete="name" dir="auto" maxlength="100" required value="'+E(r.name)+'" '+(busy?'disabled ':'')+(r.field==='name'?'aria-invalid="true" aria-describedby="wallet-registration-error"':'')+'></div>'+
       '<div class="wallet-registration-field"><label for="wallet-card-email">'+sayText('البريد الإلكتروني','Email address')+'</label><div class="wallet-verified-email"><input id="wallet-card-email" type="email" dir="ltr" value="'+E(S().auth?.email||'')+'" readonly autocomplete="email" aria-describedby="wallet-email-verified">'+I('check')+'</div><span id="wallet-email-verified" class="wallet-registration-note">'+sayText('بريد حسابك المؤكّد','Your verified account email')+'</span></div>'+
       '<details class="wallet-registration-terms"><summary>'+sayText('شروط بطاقة المحفظة','Wallet card terms')+I('arrow')+'</summary><p dir="auto">'+E(walletCampaignTerms())+'</p></details>'+
       '<label class="wallet-registration-accept"><input type="checkbox" name="walletAcceptTerms" value="yes" '+(r.accepted?'checked ':'')+(busy?'disabled ':'')+'required '+(r.field==='terms'?'aria-invalid="true" aria-describedby="wallet-registration-error"':'')+'><span>'+sayText('قرأت شروط البطاقة وأوافق عليها.','I have read and agree to the card terms.')+'</span></label>'+
       (r.error?'<p id="wallet-registration-error" class="wallet-registration-error" role="alert">'+E(r.error)+'</p>':'')+
       (!r.canEnroll?'<div class="wallet-registration-account"><p>'+sayText('سجّلي الدخول ببريدك لإصدار بطاقتك.','Sign in with your email to issue your card.')+'</p>'+button('nav',sayText('الانتقال إلى حسابي','Go to my account'),{id:'account',cls:'wallet-registration-refresh'})+'</div>':'')+
       '<button type="submit" class="wallet-start-continue" '+(busy||!r.canEnroll?'disabled':'')+'>'+walletIcon()+'<span>'+E(busy?X('نجهّز بطاقتك…','Preparing your card…'):X('جهّزي بطاقتي','Prepare my card'))+'</span>'+I('arrow')+'</button><p class="wallet-registration-note wallet-registration-privacy">'+sayText('نشارك اسمك وبريدك مع Loopy Loyalty لإصدار البطاقة.','Your name and email are shared with Loopy Loyalty to issue your card.')+'</p></form>';
   }
   return '<section class="wallet-start wallet-registration">'+walletRegistrationCard()+content+(r.error&&blocked?'<p class="wallet-registration-error" role="alert">'+E(r.error)+'</p>':'')+'<p class="wallet-registration-separate">'+E(walletTerms())+'</p></section>';
 }
 function safeWalletPassURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&((u.hostname==='loyalty.is'&&/^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))||(u.hostname==='q.passkit.net'&&/^\/p-[A-Za-z0-9_-]+\/?$/.test(u.pathname)));}catch{return false;}}
 function walletEnrollmentReceipt(value){
   if(!value||!['none','issued','pending','unknown'].includes(value.status))return {status:'unknown'};
   if(value.status==='issued'&&!safeWalletPassURL(value.url))return {status:'unknown'};
   return value;
 }
 function walletEnrollmentError(value){
   if(['LOOPY_DUPLICATE_CARDS','LOOPY_INVALID_LOOKUP','LOOPY_INVALID_CARD'].includes(value.errorCode))return X('تعذّر ربط البطاقة الحالية. تواصلي مع كلينيمي.','Your existing card could not be linked. Contact Clinime.');
   return value.errorCode==='LOOPY_ENROLLMENT_REJECTED'?X('تعذّر إصدار البطاقة بهذه البيانات. راجعي الاسم ثم حاولي مجددًا.','The card could not be issued with these details. Check your name and try again.'):X('تعذّر تجهيز البطاقة. حدّثي التفاصيل أو تواصلي مع الاستقبال قبل المحاولة مجددًا.','Your card could not be prepared. Refresh the details or contact reception before trying again.');
 }
 async function submitWalletRegistration(fields){
   identity();const r=walletRegistration;if(!owner||!customWalletEnrollment()||!r.canEnroll||r.request||r.attempted||r.receipt.status!=='none'||!r.campaign)return;
   r.name=String(fields.get('walletCardName')||'').trim();r.accepted=fields.get('walletAcceptTerms')==='yes';r.error='';r.field='';
   if(!r.name){r.error=X('اكتبي الاسم الذي تودّين ظهوره على بطاقتك.','Enter the name you would like on your card.');r.field='name';paint();document.getElementById('wallet-card-name')?.focus();return;}
   if(!r.accepted){r.error=X('راجعي شروط البطاقة ووافقي عليها للمتابعة.','Review and accept the card terms to continue.');r.field='terms';paint();document.querySelector('[name="walletAcceptTerms"]')?.focus();return;}
   const g=generation,o=owner;r.requestId=r.requestId||API.uuid();r.phase='submitting';r.attempted=true;r.receipt={status:'pending'};paint();
   const task=(async()=>{try{
     const result=await API.request('/api/wallet/enroll',{method:'POST',body:{requestId:r.requestId,name:r.name,acceptTerms:true,campaignVersion:r.campaign.version},timeout:25000});
     if(!valid(g,o)||r!==walletRegistration)return;
     r.receipt=walletEnrollmentReceipt(result.enrollment);r.phase='ready';
     if(r.receipt.status==='none'&&(r.receipt.retryAllowed===true||r.receipt.errorCode==='LOOPY_ENROLLMENT_REJECTED')){r.attempted=false;r.requestId=null;r.error=walletEnrollmentError(r.receipt);}
     speak(r.receipt.status==='issued'?X('بطاقتك جاهزة. افتحي الرابط لإضافتها للمحفظة.','Your card is ready. Open the link to add it to your wallet.'):r.receipt.status==='none'?r.error:X('وصل طلب البطاقة. يمكنك تحديث حالته.','Your card request was received. You can refresh its status.'));
   }catch(e){
     if(!valid(g,o)||r!==walletRegistration)return;
     if(recoverAuth(e))return;
     r.phase='ready';r.receipt={status:'unknown'};r.error='';
     const safeErrors=['INVALID_REQUEST','LOOPY_TERMS_REQUIRED','LOOPY_CAMPAIGN_CHANGED','LOOPY_CAMPAIGN_UNAVAILABLE','LOOPY_FORM_CHANGED','LOOPY_STORE_UNAVAILABLE','LOOPY_NOT_CONFIGURED','LOOPY_INVALID_CAMPAIGN','LOOPY_REWARD_CHANGED','WALLET_EMAIL_REQUIRED'];
     if(safeErrors.includes(e.code)){r.attempted=false;r.requestId=null;r.receipt={status:'none'};r.error=e.code==='INVALID_REQUEST'?X('تحققي من الاسم على البطاقة.','Check the name on your card.'):e.code==='LOOPY_TERMS_REQUIRED'?X('وافقي على شروط البطاقة للمتابعة.','Accept the card terms to continue.'):e.code==='WALLET_EMAIL_REQUIRED'?X('سجّلي الدخول ببريدك لإصدار بطاقتك.','Sign in with your email to issue your card.'):X('تعذّر تجهيز البطاقة. حدّثي التفاصيل وراجعيها قبل المتابعة.','Your card could not be prepared. Refresh the details and review them before continuing.');r.field=e.code==='INVALID_REQUEST'?'name':'terms';r.accepted=false;if(e.code==='WALLET_EMAIL_REQUIRED')r.canEnroll=false;if(['LOOPY_CAMPAIGN_CHANGED','LOOPY_CAMPAIGN_UNAVAILABLE','LOOPY_FORM_CHANGED','LOOPY_NOT_CONFIGURED','LOOPY_INVALID_CAMPAIGN','LOOPY_REWARD_CHANGED'].includes(e.code)){r.phase='error';r.campaign=null;}
       if(e.code==='LOOPY_CAMPAIGN_CHANGED')try{const latest=await API.request('/api/wallet/campaign');if(!valid(g,o)||r!==walletRegistration)return;r.campaign=latest.campaign;r.receipt=walletEnrollmentReceipt(latest.enrollment);r.canEnroll=latest.canEnroll!==false;r.phase=r.campaign?'ready':'error';r.error=X('تحدّثت شروط البطاقة. راجعيها ثم وافقي عليها للمتابعة.','The card terms changed. Review them and accept again to continue.');}catch(_){/* The explicit refresh remains available after a failed read. */}
     }
   }finally{if(valid(g,o)&&r===walletRegistration){r.request=null;paint();}}})();
   r.request=task;return task;
 }
 function flipWalletCard() {
   walletFlipped=!walletFlipped;
   const card=document.querySelector('.wallet-art-card');
   if(!card)return;
   card.classList.toggle('is-flipped',walletFlipped);
   card.setAttribute('aria-pressed',String(walletFlipped));
 }
 function walletAction(surface) {
   return '<div data-wallet-surface="'+E(surface)+'">'+walletContents(surface)+'</div>';
 }
 function walletCardPage() {
   const title=X('بطاقتي','My visit card');
   if(!hasCard())return shell(title,statePanel()||quietEmpty(title,X('تفاصيل البطاقة غير متاحة حاليًا.','Card details are currently unavailable.')));
   const visitor=S().auth?.name||S().auth?.email||'';
   return shell(title,`${visitProgress()}${walletAction('card')}<dl class="loyalty-sheet-facts"><div><dt>${sayText('صاحبة البطاقة','Cardholder')}</dt><dd>${E(visitor)}</dd></div><div><dt>${sayText('زيارات أُضيف لها ختم','Visits with an earned stamp')}</dt><dd>${E(num(card().totalVisits))}</dd></div></dl>`);
 }
 function availableSection() {
   const rewards=availableFacials();
   if (!rewards.length) return '';
   return `<section class="reward-inbox"><h2>${sayText('جاهزة للحجز','Ready to book')}</h2>${rewards.map(r=>`<article class="reward-note"><div>${flower()}<div><h3>${E(rewardName())}</h3><small>${E(r.receivedGift?X('هدية وصلتك','Gift received'):X('مكافأة زياراتك','Earned with your visits'))}</small></div></div>${actionLabel('facial-open','عرض الجلسة','View facial',{id:r.id,cls:'loyalty-button'})}</article>`).join('')}</section>`;
 }
 function programHome() {
   if(!hasCard()) return overview();
   return shell(X('مكافآتي','My rewards'),`${status==='error'?`<p class="loyalty-error" role="alert">${E(error)}</p>`:''}${visitProgress()}${availableSection()}${walletAction('rewards')}
     <section class="program-index">${programRow('visit-card',I('grid'),X('تفاصيل بطاقتي','My visit card details'),X('اسم صاحبة البطاقة وزياراتها المختومة','Cardholder and stamped visits'))}
     ${programRow('loyalty-history',I('calendar'),X('سجل الزيارات والمكافآت','Visits and rewards'),X('تواريخ الأختام والجلسات المجانية','Stamp dates and complimentary facials'))}
     </section>${link('loyalty-refresh',status==='refreshing'?X('جارٍ التحديث…','Refreshing…'):X('تحديث المكافآت','Refresh rewards'),'',status==='refreshing'?'disabled':'')}`);
 }
 function programRow(route,icon,label,hint) {
   return button('nav',`<span class="program-row-icon">${icon}</span><span><strong>${E(label)}</strong><small>${E(hint)}</small></span>${I('chevron')}`,{id:route,cls:'program-row'});
 }
 function programAccount() {
   if(wallet&&!hasCard())return accountSummary();
   const n=hasCard()?availableFacials().length:0;
   const hint=n?X('عندك جلسة عناية جاهزة','You have a facial ready to book'):hasCard()?X(`${num(card().stamps)} من ${num(card().target)} أختام`,`${card().stamps} of ${card().target} stamps`):X('بطاقة زياراتك وجلسات العناية','Your visit card and earned facials');
   const balance=hasCard()?money(wallet.referralWallet.balanceSar):X('رمز دعوتك ورصيدك','Your invitation code and credit');
   return `<section class="loyalty-account-summary program-account">${programRow('loyalty',I('heart'),X('مكافآتي','My rewards'),hint)}${programRow('referrals',I('share'),X('إحالاتي','My referrals'),balance)}</section>`;
 }
 function programHistory() {
   if(!hasCard())return history();
   const visits=(card().visits||[]).map(v=>({at:v.at,title:X('ختم زيارة','Visit stamp'),detail:X('أُضيف إلى بطاقتك','Added to your card')}));
   const rewards=(card().rewards||[]).map(r=>({at:r.status==='gifted'?r.giftedAt:r.usedAt||r.giftedAt||r.earnedAt,title:rewardName(),detail:r.status==='gifted'?X('أهديتِ الجلسة','Gifted'):r.status==='booked'?X('استُخدمت في حجز','Used in a booking'):r.receivedGift?X('هدية متاحة للحجز','Gift available to book'):X('متاحة للحجز أو الإهداء','Available to book or gift')}));
   const events=[...visits,...rewards].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
   return shell(X('سجل الزيارات والمكافآت','Visits and rewards'),events.length?`<ul class="program-ledger">${events.map(v=>`<li><div><strong>${E(v.title)}</strong><small>${E(v.detail)}</small></div><time>${E(date(v.at))}</time></li>`).join('')}</ul>`:quietEmpty(X('تبدأ بطاقتك من أول زيارة','Your first visit starts the card'),X('لما يسجّل فريق كلينيمي حضورك لزيارة مؤهلة، يظهر ختمها وتاريخه هنا.','When the Clinime team records your arrival for an eligible visit, your stamp and its date appear here.')));
 }
 function quietEmpty(title,description){return `<div class="program-empty"><strong>${E(title)}</strong><p>${E(description)}</p></div>`;}
 function referralPage() {
   const title=X('الإحالات','Referrals');
   if(!hasCard())return shell(title,statePanel()||`<p>${sayText('تحديث الإحالات غير متاح حاليًا.','Referral details are unavailable right now.')}</p>`);
   const w=wallet.referralWallet, entries=[...(w.entries||[])].sort((a,b)=>String(b.completedAt||b.createdAt).localeCompare(String(a.completedAt||a.createdAt)));
   const offer=Number(w.creditPerReferralSar)>0?X(`ينضاف لكِ ${money(w.creditPerReferralSar)} بعد إتمام أول زيارة مؤهلة لصديقتك وسدادها.`,`You earn ${money(w.creditPerReferralSar)} after your friend's first qualifying visit is completed and paid.`):X('قيمة رصيد الدعوة لم تُحدّد بعد.','The credit amount per referral has not been set yet.');
   return shell(title,`<section class="referral-funds"><span>${sayText('رصيدك في كلينيمي','Your Clinime credit')}</span><strong><bdi>${E(money(w.balanceSar))}</bdi></strong><p>${sayText('للاستخدام عند حجز خدماتك.','Use your credit when booking a treatment.')}</p></section>
     <section class="loyalty-section loyalty-referral"><h2>${sayText('ادعي صديقة','Invite a friend')}</h2><p>${E(offer)}</p>
     ${wallet.referralCode?`<div class="loyalty-referral-code">${codeTag(wallet.referralCode)}${link('loyalty-copy-referral',X('نسخ الرمز','Copy code'))}</div>${button('invite-share',I('share')+sayText('مشاركة رابط الدعوة','Share invitation link'),{cls:'loyalty-button loyalty-button--secondary'})}${link('invite-copy-link',X('نسخ رابط الدعوة','Copy invitation link'))}`:''}</section>
     <section class="loyalty-section"><h2>${sayText('حركة الرصيد','Credit activity')}</h2>${entries.length?`<ul class="program-ledger">${entries.map(e=>`<li><div><strong>${E(referralEventTitle(e))}</strong><small>${E(date(e.completedAt||e.createdAt))}</small></div><bdi>${e.amountSar==null?'—':E(money(e.amountSar))}</bdi></li>`).join('')}</ul>`:quietEmpty(X('ما عندك حركة رصيد بعد','No credit activity yet'),X('هنا تتابعين الدعوات المسجّلة ومتى أُضيف الرصيد.','Your referral activity and credit dates will appear here.'))}</section>`);
 }
 function referralEventTitle(e) {
   if(e.status==='care-prize'||e.kind==='care-prize'||e.type==='care-prize')return X('جائزة نقطة عناية','Care Point prize');
   if(e.status==='restored')return X('أُعيد الرصيد بعد إلغاء الحجز','Credit restored after cancellation');
   if(e.status==='spent'||e.type==='spend'||e.kind==='spend'||Number(e.amountSar)<0)return X('رصيد استُخدم في الحجز','Credit used for a booking');
   const labels={pending:['بانتظار إتمام الزيارة','Waiting for the visit'],confirmed:['أُضيف رصيد الدعوة','Referral credit added'],credited:['أُضيف رصيد الدعوة','Referral credit added'],cancelled:['أُلغيت الزيارة','Visit cancelled'],disqualified:['دعوة غير مؤهلة','Ineligible referral'],reversed:['تسوية الرصيد','Credit adjustment']};
   return labels[e.status]?X(...labels[e.status]):X('حركة رصيد','Credit activity');
 }
 async function copyInvite() {
   if(!wallet?.referralCode)return;
   const g=generation,o=owner,url=referralAddress();
   try{await navigator.clipboard.writeText(url);if(!valid(g,o))return;announce(X('نُسخ رابط الدعوة','Invitation link copied'));paint();}
   catch{if(valid(g,o))A.openModal('loyalty-copy',{code:url,isLink:true});}
 }
 async function shareInvite() {
   if(!wallet?.referralCode)return;
   const g=generation,o=owner,url=referralAddress(),title=X('دعوة إلى كلينيمي','An invitation to Clinime');
   if(navigator.share)try{await navigator.share({title,url});return;}catch(e){if(e.name==='AbortError')return;}
   if(valid(g,o))await copyInvite();
 }
 function rewardDetail() {
   if(!hasCard())return rewards();
   const r=availableFacials().find(r=>r.id===S().routeId)||(!S().routeId&&availableFacials()[0]);
   if(!r)return shell(X('جلسة العناية','Your facial'),quietEmpty(X('لا توجد جلسة متاحة هنا','This facial is unavailable'),X('راجعي سجل المكافآت لمعرفة آخر تحديث.','Check your rewards history for the latest update.'))+link('nav',X('مكافآتي','My rewards'),'loyalty'));
   return shell(X('جلسة العناية','Your facial'),`<section class="facial-reveal">${flower(true)}<p>${E(r.receivedGift?X('هدية وصلتك','A gift for you'):X('جمعتِ خمسة أختام','You earned five stamps'))}</p><h2>${E(rewardName())}</h2><span>${sayText('جلسة مجانية','Complimentary treatment')}</span></section>
     <div class="facial-choices">${actionLabel('facial-book','احجزي جلستك','Book your facial',{id:r.id})}
     ${!r.receivedGift?actionLabel('facial-gift','أهدي الجلسة','Gift the facial',{id:r.id,cls:'loyalty-button loyalty-button--secondary'}):''}</div>
     <p class="loyalty-caption">${sayText('تُستخدم المكافأة لجلسة واحدة.','This reward covers one treatment.')}</p>`);
 }
 function facialBook(id) {
   const r=availableFacials().find(e=>e.id===id);
   if(!r||!A.service(r.serviceId)||S().recovery)return;
   if(S().draft?.mode==='edit'){announce(X('أكملي تعديل موعدك قبل حجز جلسة جديدة.','Finish editing your appointment before booking a new facial.'));paint();return;}
   if(!S().cart.some(i=>i.serviceId===r.serviceId))S().cart.push({id:API.uuid(),serviceId:r.serviceId,optionId:null});
   if(S().draft)S().draft.time=null;
   promo={...promo,input:r.code,code:r.code,quote:null,error:'',status:'stale',itemsKey:'',sequence:promo.sequence+1};
   A.go('availability');
 }
 function giftModal() {
   const m=S().modal;if(m?.type!=='loyalty-facial-gift')return modal();
   return `<dialog id="active-dialog" class="app-dialog loyalty-dialog" aria-labelledby="dialog-title"><div class="dialog-header"><h2 id="dialog-title">${sayText('لمن تهدين الجلسة؟','Who is the facial for?')}</h2>${button('close-modal',I('close'),{cls:'loyalty-icon',disabled:S().pending,extra:'aria-label="'+sayText('إغلاق','Close')+'"'})}</div><div class="loyalty-dialog-body">
     <p>${sayText('تنتقل الجلسة إلى حساب صاحبة البريد، وتظهر لها في «مكافآتي» عند تسجيل الدخول بهذا البريد.','The facial moves to the recipient’s account. She will find it in My rewards when she signs in with this email.')}</p>
     <form data-form="facial-gift" class="facial-gift-form"><label for="facial-gift-email">${sayText('بريد المستفيدة','Recipient email')}</label>
     <input id="facial-gift-email" name="giftEmail" type="email" dir="ltr" autocomplete="off" required maxlength="254" value="${E(giftEmail)}" ${S().pending||giftRequest?'readonly':''}>
     ${giftError?`<p role="alert" class="loyalty-error">${E(giftError)}</p>`:''}
     <button class="loyalty-button" type="submit" ${S().pending?'disabled':''}>${E(S().pending?X('جارٍ الحفظ…','Saving…'):giftRequest?X('التحقق من نتيجة الإهداء','Check gift status'):X('تأكيد إهداء الجلسة','Confirm gift'))}</button></form></div></dialog>`;
 }
 async function submitGift(fields) {
   const id=S().modal?.rewardId,email=String(fields.get('giftEmail')||'').trim().toLowerCase(),g=generation,o=owner;
   if(!id||!email||!owner||S().pending)return;
   const request=giftRequest||{rewardId:id,recipientEmail:email,locale:S().locale,requestId:API.uuid()};
   giftEmail=email; giftError=''; giftRequest=request; S().pending=true; paint();
   try{
     const result=await API.request('/api/loyalty/gift',{method:'POST',body:request});
     if(!valid(g,o))return;
     read++;loading=null;wallet=result.wallet;status='ready';S().pending=false;S().modal=null;giftEmail='';giftRequest=null;
     A.go('loyalty');announce(X('أُهديت الجلسة. يمكن للمستفيدة فتح «مكافآتي» من حسابها.','Facial gifted. The recipient can open My rewards in her account.'));paint();
   }catch(e){
     if(!valid(g,o))return;
     S().pending=false;if(recoverAuth(e))return;
     if(!e.uncertain)giftRequest=null;
     giftError=e.uncertain?X('لم نتأكد من نتيجة الإهداء. تحققي بنفس الطلب.','The gift outcome is unknown. Check this same request.'):errorText(e);paint();
   }
 }
 function offerGift(id) {
   if(giftRequest&&giftRequest.rewardId!==id)return;
   if(!giftRequest){giftEmail='';giftError='';}
   if(!availableFacials().some(r=>r.id===id&&!r.receivedGift))return;
   A.openModal('loyalty-facial-gift',{rewardId:id});
 }
 function programPromotion() {
   if(!hasCard())return reviewPromotion();
   if(S().draft?.mode==='edit')return '';
   const ready=promo.status==='ready'&&promo.itemsKey===itemsKey(),locked=!!S().recovery,busy=promo.status==='loading';
   const facial=availableFacials().find(r=>S().cart.some(item=>item.serviceId===r.serviceId));
   const selected=ready?promo.quote:null;
   const actions=!selected&&!locked?`<div class="checkout-benefits">
     ${facial?actionLabel('facial-apply','استخدمي جلسة العناية المجانية','Apply your free facial',{id:facial.id,cls:'loyalty-button loyalty-button--secondary',disabled:busy}):''}
     ${wallet.referralWallet.balanceSar>0?button('balance-apply',E(X(`استخدمي رصيدك · ${money(wallet.referralWallet.balanceSar)}`,`Use your credit · ${money(wallet.referralWallet.balanceSar)}`)),{cls:'loyalty-button loyalty-button--secondary',disabled:busy}):''}</div>`:'';
   const form=`<form data-form="loyalty-promotion"><label for="promotion-code">${sayText('رمز الدعوة أو القسيمة','Referral or coupon code')}</label>
     <div class="loyalty-promotion-field"><input id="promotion-code" name="promotionCode" dir="ltr" autocomplete="off" autocapitalize="characters" maxlength="48" value="${E(promo.input)}" ${locked||busy?'disabled':''} ${promo.error?'aria-invalid="true" aria-describedby="promotion-error"':''}>
     <button class="loyalty-button loyalty-button--secondary" type="submit" ${locked||busy?'disabled':''}>${E(busy?X('جارٍ التحقق…','Checking…'):X('تطبيق','Apply'))}</button></div></form>`;
   return `<section class="loyalty-promotion"><h2>${sayText('المكافآت ورمز الدعوة','Rewards and referral code')}</h2>${actions}${selected?
     `<div class="loyalty-promotion-applied"><p>${I('check')}${E(kindLabel(selected))}</p>${link('loyalty-promotion-remove',X('إزالة','Remove'),'',locked?'disabled':'')}</div>`:form}
     ${promo.error?`<p id="promotion-error" class="loyalty-error" role="alert">${E(promo.error)}</p>`:''}
     ${!selected&&promo.input.trim()?link('loyalty-promotion-remove',X('إزالة الرمز','Remove code'),'',locked?'disabled':''):''}</section>`;
 }
 function kindLabel(p) {
   switch(p.kind){
     case 'facial':return X('جلسة تنظيف البشرة المجانية','Complimentary Basic Facial');
     case 'referral':return p.discount?X('خصم الدعوة','Referral discount'):X('سُجّل رمز الدعوة','Referral code recorded');
     case 'wallet':return X('رصيد الإحالات','Referral credit');
     default:return X('خصم القسيمة','Coupon discount');
   }
 }

 function reviewPricing(fallback){if(S().draft?.mode==='edit'){const b=S().bookings?.find(b=>b.id===S().draft.bookingId);if(b?.pricing)return bookingPricing(b);}const q=S().draft?.mode==='edit'?null:promo.status==='ready'&&promo.itemsKey===itemsKey()?promo.quote:null;return q?`<div class="loyalty-price-breakdown"><div><span>${E(X('قبل الخصم','Subtotal'))}</span><bdi>${E(money(q.subtotal))}</bdi></div>${Number(q.discount)>0?`<div><span>${E(kindLabel(q))}</span><bdi dir="ltr">−${E(money(q.discount))}</bdi></div>`:''}<div class="journey-total"><span>${E(X('الإجمالي','Total'))}</span><strong><bdi>${E(money(q.total))}</bdi></strong></div></div>`:`<div class="journey-total"><span>${E(A.t('total'))}</span><strong>${E(A.money(fallback))}</strong></div>`;}
 function reviewPrice(fallback){if(S().draft?.mode==='edit'){const b=S().bookings?.find(b=>b.id===S().draft.bookingId);return b?.pricing?money(b.pricing.total):fallback;}return promo.status==='ready'&&promo.itemsKey===itemsKey()?money(promo.quote.total):fallback;}
 function beforeConfirm(){if(S().draft?.mode==='edit'||S().recovery)return true;if((promo.code||promo.input.trim())&&(promo.status!=='ready'||promo.itemsKey!==itemsKey()||promo.input.trim().toUpperCase()!==promo.code)){if(!promo.requiresRequote)promo.error=X('أعيدي تطبيق الرمز أو أزيليه لتأكيد السعر قبل الحجز','Apply the code again or remove it to confirm the price before booking');A.render({preserve:true});announce(promo.error);document.getElementById('promotion-code')?.focus();return false;}return true;}
 function promotionPayload(){
   if(!promo.code||promo.status!=='ready'||promo.itemsKey!==itemsKey())return {};
   const q=promo.quote;
   return {promotionCode:q.code||promo.code,...(q.kind==='wallet'?{expectedWalletPricing:{discount:q.discount,total:q.total}}:{})};
 }
 function bookingPricing(b){const p=b?.pricing;if(!p)return'';if(Number(p.discount)===0)return `<div class="journey-total"><span>${E(A.t('total'))}</span><strong><bdi>${E(money(p.total))}</bdi></strong></div>`;return `<section class="loyalty-price-breakdown" aria-label="${E(X('سعر الحجز','Booking price'))}"><div><span>${E(X('قبل الخصم','Subtotal'))}</span><bdi>${E(money(p.subtotal))}</bdi></div>${Number(p.discount)>0?`<div><span>${E(kindLabel(p))}</span><bdi dir="ltr">−${E(money(p.discount))}</bdi></div>`:''}<div class="journey-total"><span>${E(A.t('total'))}</span><strong><bdi>${E(money(p.total))}</bdi></strong></div></section>`;}
 function bookingSaved(kind){if(kind==='create')forgetInvite();read++;loading=null;feedback='';promo={input:'',code:'',status:'idle',quote:null,error:'',itemsKey:'',sequence:promo.sequence+1};if(owner)load({refresh:true});}
 function bookingFailed(e){
   if(e.code==='WALLET_QUOTE_CHANGED'){
     promo.status='error';promo.quote=null;promo.itemsKey='';promo.sequence++;promo.requiresRequote=true;
     promo.error=errorText(e);load({refresh:true});return promo.error;
   }
   if(e.code?.startsWith('PROMOTION_')||['SELF_REFERRAL','REFERRAL_INELIGIBLE','REWARD_UNAVAILABLE','REWARD_NOT_ELIGIBLE','WALLET_EMPTY'].includes(e.code)){promo.status='error';promo.quote=null;promo.error=errorText(e);return promo.error;}return null;}
 const actions={'wallet-registration-refresh':loadWalletRegistration,'wallet-flip':flipWalletCard,'facial-open':id=>A.go('reward',id),'facial-book':facialBook,'facial-gift':offerGift,'invite-share':shareInvite,'invite-copy-link':copyInvite,'balance-apply':()=>applyPromotion('WALLET'),'facial-apply':id=>{const r=availableFacials().find(r=>r.id===id);if(r)applyPromotion(r.code);},'loyalty-refresh':()=>load({refresh:true}),'loyalty-redeem-open':redeemOpen,'loyalty-resume':resume,'loyalty-redeem-confirm':redeem,'loyalty-copy-referral':()=>copy(wallet?.referralCode),'loyalty-copy-coupon':id=>copy((wallet?.coupons||[]).find(c=>c.id===id)?.code||S().modal?.coupon?.code),'loyalty-share':share,'loyalty-use':useCoupon,'loyalty-tab':id=>{if(!['points','coupons'].includes(id))return;historyTab=id;A.render({preserve:true});},'loyalty-coupons':()=>{historyTab='coupons';A.go('loyalty-history');},'loyalty-entry':id=>{const entry=wallet?.entries?.find(e=>e.id===id);if(entry)A.openModal('loyalty-entry',{entry});},'loyalty-coupon-detail':id=>A.go('loyalty-coupon',id),'loyalty-promotion-remove':()=>{if(S().recovery)return;forgetInvite();promo={input:'',code:'',status:'idle',quote:null,error:'',itemsKey:'',sequence:promo.sequence+1};announce(X('أُزيل الرمز','Code removed'));A.render({preserve:true});}};
 function homeHooks(){
   if(owner&&status==='idle')queueMicrotask(()=>{if(S().route==='home'&&status==='idle')load();});
   const actual=hasCard(),c=actual?card():null,n=actual?Number(c.stamps)||0:0,target=actual?Number(c.target)||0:5;
   const hint=actual?X(`${num(n)} من ${num(target)} أختام`,`${n} of ${target} stamps`):owner?status==='error'?X('تعذّر تحديث البطاقة','Card update unavailable'):status==='loading'||status==='idle'?X('جارٍ تحديث بطاقتك…','Updating your card…'):X('بطاقة زياراتك ومكافآتك','Your visit card and rewards'):X('كل زيارة، أقرب لمكافأتك','Every visit brings your reward closer');
   const remaining=actual?Math.max(0,target-n):null;
   const progress=actual?remaining===0?X('مكافأتك بانتظارك','Your reward is ready'):X(remaining===1?'بقي لكِ ختم واحد':remaining===2?'بقي لكِ ختمان':`بقي لكِ ${num(remaining)} أختام`,`${num(remaining)} ${remaining===1?'stamp':'stamps'} to go`):X('عنايتك ترجع لكِ','Your care gives back');
   const note=target===5?X('الزيارة الخامسة: تنظيف بشرة أساسي مجانًا، لكِ أو هدية.','Visit five: a complimentary Basic Facial, for you or as a gift.'):X('شوفي بطاقتك ومكافآت زياراتك.','See your card and visit rewards.');
   return `<button type="button" class="care-home-referral" data-action="nav" data-id="referrals" data-care-motion><span><strong>${E(X('العناية أحلى مع صديقاتك','Care is better with friends'))}</strong><small>${E(X('شاركي كودك','Share your code'))} ${I('arrow')}</small></span>${window.ClinimeCareArt.friends()}</button><section class="care-home-rewards-section" aria-labelledby="care-rewards-title"><h2 id="care-rewards-title">${E(X('مكافآتي','My rewards'))}</h2><div class="care-home-reward" data-care-motion><span class="care-card-scene" aria-hidden="true"><i class="care-card-ribbon-one"></i><i class="care-card-ribbon-two"></i><i class="care-card-spark-one"></i><i class="care-card-spark-two"></i></span><div class="care-reward-heading"><div><h3>${E(X('بطاقة عنايتك','Your care card'))}</h3><p>${E(hint)}</p></div>${window.ClinimeCareArt.gift()}</div>${target>0?`<div class="care-home-stamps" ${actual?`role="img" aria-label="${E(hint)}"`:'aria-hidden="true"'}>${Array.from({length:Math.min(target,10)},(_,i)=>`<span class="${actual&&i<n?'is-earned ':''}${i===target-1?'is-gift':''}" aria-hidden="true">${window.ClinimeCareArt.stamp(i===target-1)}</span>`).join('')}</div>`:'<div class="care-card-pending" aria-hidden="true"></div>'}<div class="care-reward-footer"><strong>${E(progress)}</strong><button type="button" data-action="nav" data-id="loyalty">${E(X('شوفي بطاقتك','View your card'))} ${I('arrow')}</button></div><p class="care-reward-note">${E(note)}</p></div></section>`;
 }
 window.ClinimeLoyalty={homeHooks,walletAction,setWalletEnrollment,routes:{'wallet-start':walletStart,loyalty:programHome,'visit-card':walletCardPage,referrals:referralPage,'loyalty-history':programHistory,reward:rewardDetail,'loyalty-coupon':couponDetail,'loyalty-terms':terms},knownRoutes:routes,actions,identity,entered,modal:giftModal,accountSummary:programAccount,reviewPromotion:programPromotion,reviewPricing,reviewPrice,beforeConfirm,promotionPayload,bookingPricing,bookingSaved,bookingFailed,cartChanged,money,clear:()=>{owner='__clear__';identity();},input:input=>{if(input.name==='walletCardName'){walletRegistration.name=input.value;return true;}if(input.name==='walletAcceptTerms'){walletRegistration.accepted=input.checked;return true;}if(input.name==='giftEmail'){giftEmail=input.value;return true;}if(input.name!=='promotionCode')return false;promo.input=input.value;if(promo.code&&input.value.trim().toUpperCase()!==promo.code){const wasReady=promo.status==='ready';promo.status='stale';promo.quote=null;promo.sequence++;if(wasReady)A.render({preserve:true});}return true;},form:(name,fields)=>{if(name==='wallet-registration'){submitWalletRegistration(fields);return true;}if(name==='facial-gift'){submitGift(fields);return true;}if(name!=='loyalty-promotion')return false;applyPromotion(String(fields.get('promotionCode')||''));return true;}};
})();
