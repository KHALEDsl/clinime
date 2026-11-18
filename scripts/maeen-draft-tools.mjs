import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

const norm = text => String(text).normalize('NFKC').replace(/[\u064b-\u065fـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
const available = list => list.filter(s=>s.active!==false && s.availability!=='unavailable');
const saveWord = /احفظ|حفظها|حفظه|خزن|سجله كمسود|سجلها كمسود|خله مسود|خلها مسود/;
const editWord = /^(?:(?:طيب|تمام|ايه|ممكن|تكفى|ابغاك|ابيك|لو سمحت)[،, ]+)*(?:عدل|عدلي|غير|بدل|اختصر|قصر|خل[هي]|خله|اضف|ضيف|احذف|شيل|استبدل|اكتبها|عيد صياغ|زود|حط|ابغاها|ابيها)/;
const noWrite = /(?:لا|مو لازم|مب لازم|ما (?:ابي|ابغي|ابغا|احتاج|ودي)|بدون|من دون|مابي|مابغي)\s*(?:انك |ان |ما )?(?:ت?حفظ|الحفظ|ت?عدل|التعديل|ت?غير|تسجل|تخزن)|(?:لا تعدل|لا تغير)|(?:التعديل|الحفظ) بس بعد/;
const informational = /^(?:هل|كيف|متي|اذا|لو |وش رايك لو|تعرف|تقدر تقول لي|تتوقع)|(?:حفظته|حفظتها|محفوظ[هة]؟?)[؟?]?$/;
const formatOf = text => /ستوري|ستوريز|story/.test(text)?'ستوري':/ريلز|ريل|فيديو/.test(text)?'ريلز':/اعلان/.test(text)?'إعلان مدفوع':/بوست|منشور/.test(text)?'منشور':null;
function fail(status,message) { throw Object.assign(Error(message),{status}); }

function targetDay(text,now) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const explicit=text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if(explicit){
    const date=new Date(explicit[1]+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==explicit[1])fail(400,'التاريخ غير صحيح.');
    return explicit[1];
  }
  const offset=/بعد (?:بكر[هة]|غد)/.test(text)?2:/بكر[هة]|بكرا|غدا|للغد/.test(text)?1:/اليوم/.test(text)?0:null;
  const date=new Date(today+'T12:00:00Z');
  const day=['الاحد','الاثنين','الثلاثاء','الاربعاء','الخميس','الجمع[هة]','السبت'].findIndex(d=>new RegExp(d).test(text));
  if(offset===null && day<0) return null;
  date.setUTCDate(date.getUTCDate()+(offset??((day-date.getUTCDay()+7)%7||7)));
  return date.toISOString().slice(0,10);
}
const digest = (key,owner,data) => createHmac('sha256',key).update(JSON.stringify([owner,data])).digest();
function seal(data,key,owner){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return payload+'.'+digest(key,owner,payload).toString('base64url');}
function unseal(token,key,owner,now){
  if(typeof token!=='string'||token.length>10000)fail(400,'اختيار الخدمة غير صالح.');
  const [payload,signature]=token.split('.'),mac=Buffer.from(signature||'','base64url'),expected=digest(key,owner,payload||'');
  if(mac.length!==expected.length||!timingSafeEqual(mac,expected))fail(400,'اختيار الخدمة غير صالح.');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString());
  if(data.expires<now.getTime())fail(400,'انتهت مهلة الاختيار. ابدأ بطلب مسودة جديدة.');
  return data;
}
function serviceMatches(request,catalog){
  const phrase=norm(request);
  const exact=catalog.filter(s=>[s.nameAr,s.nameEn].some(n=>n&&phrase.includes(norm(n))));
  if(exact.length)return exact;
  if(/تنظيف (?:ال)?بشر[هة]|تنظيف (?:ال)?وجه/.test(phrase)) {
    const options=catalog.filter(s=>norm(s.nameAr).includes('تنظيف البشر'));
    if(/اساسي|عميق/.test(phrase))return options.filter(s=>norm(s.nameAr).includes(phrase.includes('عميق')?'عميق':'اساسي'));
    return options;
  }
  return [];
}
function resolveChoice(text,candidates){
  const clean=norm(text).trim().replace(/[؟!.،]/g,'');
  const matches=serviceMatches(clean,candidates);
  if(matches.length===1)return matches[0];
  const order=['الاول','الثاني','الثالث','الرابع'].findIndex((word,i)=>[word,word+'ه',word+'ة',String(i+1),'١٢٣٤'[i]].includes(clean));
  if(order>=0)return candidates[order];
  const narrowed=candidates.filter(s=>norm(s.nameAr).split(' ').some(w=>w.length>=4 && clean.includes(w.replace(/^ال/,''))));
  return narrowed.length===1?narrowed[0]:null;
}
function clarification(p,candidates,key,owner){
  return {answer:candidates.length===2?'تقصد '+candidates[0].nameAr+' أو '+candidates[1].nameAr+'؟':'أي خدمة من الكتالوج تبغى المسودة عنها؟',choices:candidates.map(s=>s.nameAr),pending:seal(p,key,owner)};
}
const capture = /^استبدل نص المسودة بهذا النص\s*[:：]\s*([\s\S]+)$/;
function saved(draft,edited=false){
  const day=draft.targetDate?new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Riyadh'}).format(new Date(draft.targetDate+'T12:00:00Z')):'';
  return {draft,answer:(edited?'عدّلت نفس المسودة':'حفظتها في «مسوداتي»')+(day?' ليوم '+day:'')+'.\n\n'+draft.text};
}

function basicStoryBrief(raw,service) {
  // Only use the catalog-backed starter for a plain creation request. A custom
  // creative direction (e.g. "للعرائس") should reach the model intact.
  let terms=norm(raw).replace(norm(service.nameAr),'').replace(/تنظيف (?:ال)?بشر[هة]/g,'');
  terms=terms.replace(/(?:احفظ|خزن)(?:ها|ه)?|(?:لبكر[هةا]|بكر[هةا]|لليوم|اليوم|بعد غد)|(?:جهز|سوي|اكتب|اعمل|ابي|ابغي|اعمل)(?:لي)?|ستوري|مسود[هة]|عن|لي|و|من فضلك|[.،؟! ]/g,'');
  return !terms;
}
export function imageRequest(text){
  const q=norm(text);
  if(/(?:(?:ما ابي|مابي|ما ابغي|لا) (?:تولد|تسوي|تغير)|بدون صور|نص فقط|نص بس|^هل|^كيف|^لو |^وش رايك|^استبدل نص المسودة)/.test(q))return false;
  if(/(?:نص|عنوان|كلام)\s+(?:الصور[هة]|الستوري)/.test(q)&&!/(?:غير|ولد|سوي) (?:الصور[هة])/.test(q))return false;
  if(/^(?:خلها|خليها|غيرها|عدلها|ابيها).{0,30}(?:افتح|اغمق|وردي|لون|اضاء|بنفسجي|بدون (?:وجوه|اشخاص)|من غير (?:وجوه|اشخاص))/.test(q))return true;
  return /(?:ارسل|ولد|توليد|صمم|سوي|جهز|ابي|ابغي|ابغا|اعمل|عطني|اعطيني|خلي|خل|اجعل|ابدل|غير|عدل|بدل|وريني|ورني|اعرض|طلع|ارسم|اعيد|اعد).{0,32}(?:صور[هة]|صوره|التصميم|خلفي[هة])|(?:صور[هة] (?:جاهز[هة]|جديد[هة]|للستوري|للمسود[هة]))/.test(q);
}
export async function runDraftTurn({owner,body,thread,catalog,store,key,generate,now=new Date()}) {
  const original=thread.at(-1).content.trim(), q=norm(original);
  const isLiteral=capture.test(original);
  if(!isLiteral && (noWrite.test(q)||(!body.pending && informational.test(q)))) {
    if(noWrite.test(q))return {answer:'تمام، نخليها نقاش. ما غيّرت المسودات.'};
    return null;
  }
  const createVisual = /(?:جهز|سوي|صمم|ابي|ابغي|ابغا|اعمل|عطني).{0,18}(?:ستوري|بوست|منشور)/.test(q) &&
    !/(?:فكر[ةه]|افكار|فكرتين|نص |اقتراح|وش رايك|مقترح|بدون صور)/.test(q);
  const saving=saveWord.test(q)||imageRequest(q)||createVisual, editing=body.draftId&&(isLiteral||editWord.test(q));
  if(!saving&&!editing&&!body.pending)return null;
  if(!/^[\w-]{12,80}$/.test(body.requestId||''))fail(400,'تعذّر تحديد طلب الحفظ.');
  const fingerprint=createHash('sha256').update(JSON.stringify([original,body.pending??null,body.draftId??null,body.revision??null])).digest('hex');
  const replay=store.replay(owner,body.requestId,fingerprint);
  if(replay)return saved(replay,replay.revision>1);
  const services=available(catalog);
  if(!services.length)return {answer:'ما فيه خدمات متاحة في الكتالوج الحين.'};
  const makeNew=!body.draftId||!isLiteral&&/مسود[هة] جديد[هة]|ستوري جديد|منشور جديد/.test(q);
  let draft=body.draftId&&!makeNew?store.get(owner,body.draftId):null;
  if(draft&&draft.revision!==body.revision)fail(409,'تعدّلت المسودة من مكان ثاني. افتح آخر نسخة من مسوداتي.');
  const movingDate = /(?:تاريخ|موعد المسود|انقلها|اجلها|خليها (?:ل|يوم)|خلها (?:ل|يوم)|احفظها (?:ل|يوم))/.test(q);
  let brief=original, date=draft?draft.targetDate:targetDay(q,now), format=draft?draft.format:(formatOf(q)||'ستوري');
  if(draft && !isLiteral && movingDate)date=targetDay(q,now)??date;
  if(draft && !isLiteral && /(?:حول|بدل|خل|غير).{0,12}(?:الصيغ|لستوري|لمنشور|لريلز|لبوست)/.test(q))format=formatOf(q)||format;
  let service;
  if(body.pending){
    const p=unseal(body.pending,key,owner,now);
    if(/^(?:الغ|خلاص|كنسل|وقف)/.test(q))return {answer:'تمام، وقّفت طلب الحفظ.'};
    const choices=services.filter(s=>p.ids.includes(s.id));
    if(!choices.length)return {answer:'الخيارات السابقة ما عادت متاحة. اطلب مسودة لخدمة ثانية.'};
    if(/[؟?]|^(?:مو |مب |مش |لا(?:[ ،,]|$)|ما ابي|وش |ايش |هل |كيف |ليه |كم |اش |ماني |بدون )/.test(q))return {...clarification(p,choices,key,owner),answer:'أي خيار تبغاني أحفظه؟ اختر اسم الخدمة عشان أتأكد.'};
    service=resolveChoice(q,choices);
    if(!service)return clarification(p,choices,key,owner);
    brief=p.brief;date=p.date;format=p.format;
  }else{
    const matches=isLiteral?[]:serviceMatches(original,services);
    if(draft&&!isLiteral&&!matches.length&&/(?:غير|بدل|عدل|استبدل)\s+(?:اسم )?(?:الخدم[هة]|الموضوع)|(?:خليها|خلها) عن/.test(q)){
      return {answer:'أي خدمة تقصد بالضبط؟ اكتب «غيّر الخدمة إلى» وبعدها اسمها من الكتالوج. المسودة الحالية ما تغيّرت.'};
    }
    if(draft&&!matches.length)service=services.find(s=>s.id===draft.serviceId);
    else if(matches.length===1)service=matches[0];
    if(draft&&!service&&!matches.length)return {answer:'الخدمة المرتبطة بهالمسودة ما عادت متاحة في الكتالوج.'};
    if(!service){
      const choices=matches.length?matches:services;
      return clarification({ids:choices.map(s=>s.id),brief,date,format,expires:now.getTime()+86400000},choices,key,owner);
    }
  }
  if(!isLiteral && /(?:انشر|جدول نشر|شغل اعلان)/.test(q))return {answer:'المتاح هنا حفظ المسودة وتعديلها. تقدر تقول «احفظها كمسودة».'};
  let content;
  const literal=original.match(capture);
  if(literal && draft){content=literal[1].trim();format=draft.format;date=draft.targetDate;}
  else if(draft && date!==draft.targetDate && /^(?:غير|عدل|خل|انقل|اجل|قدم).{0,20}(?:تاريخ|موعد|ليوم|لبكر|لليوم|للخميس)/.test(q) && !/النص|العبار/.test(q))content=draft.text;
  else if(!draft && format==='ستوري' && basicStoryBrief(brief,service)) {
    const duration=Number(service.duration);
    const detail=Number.isFinite(duration)&&duration>0&&!service.options?.length
      ? 'الجلسة مدتها '+new Intl.NumberFormat('ar-SA').format(duration)+' دقيقة.' : '';
    content=['تفكّرين تجربين '+service.nameAr+'؟',detail,'وش ودّك تعرفين قبل تحجزين؟'].filter(Boolean).join('\n');
  } else if(draft && /^(?:طيب[ ،]*)?(?:خليها|خلها|اختصرها|اختصر النص|قصرها)(?: (?:اقصر|اكثر|وفي|في|بسطر|سطر|بس|واحد|شوي|واختصرها|و))*(?:[.!؟])?$/.test(q.trim()) && draft.text.startsWith('تفكّرين تجربين ') && draft.text.includes('وش ودّك')) {
    content=service.nameAr+' في بالك؟ اسألينا قبل تحجزين.';
  }
  else {
    const copyOnly='اكتب النص النهائي فقط، موجه للعميلة باللهجة السعودية. لا تشرح ولا تضف سعر أو موعد متاح أو خصم أو ادعاء علاجي. لا تذكر حفظ أو نشر.';
    const prompt=draft?'الخدمة: '+service.nameAr+'، الصيغة: '+format+'. نص المسودة الحالية:\n'+draft.text+'\nطلب التعديل: '+brief:'الخدمة التي اختارها المستخدم: '+service.nameAr+'. الصيغة: '+format+'؛ تاريخ المسودة للتخطيط فقط. طلب المستخدم: '+brief;
    content=await generate([{role:'user',content:prompt+'\n'+copyOnly}], [service]);
    if(/(?:كل|جميع) انواع البشر|(?:كل|جميع) أنواع البشر|نتيج[ةه] (?:فوري|مضمون)|علاج مضمون|يزيل السموم|تشفي|يعالج/.test(content||''))return {answer:'النص المقترح فيه ادّعاء ما هو معتمد في الكتالوج. ما حفظته. نقدر نركّز على تعريف العميلة بالجلسة.'};
    if(!content?.trim()||content.startsWith('خلّني أتأكد')||/تم النشر|تم الحفظ|حفظت المسود/.test(content))return {answer:'ما ضبط النص هالمرة. ما حفظت أي تغيير؛ جرّب توصف لي الصياغة اللي تبيها.'};
  }
  const result=store.save(owner,{requestId:body.requestId,fingerprint,...(draft?{id:draft.id,revision:draft.revision}:{}),serviceId:service.id,serviceName:service.nameAr,format,text:content.trim(),targetDate:date});
  return {...saved(result,!!draft),visualBrief:brief};
}
