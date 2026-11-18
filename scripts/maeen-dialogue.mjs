// Local model adapter. Only the public service catalog and the current chat are model inputs.
import { editorialReply } from './maeen-editorial.mjs';
const endpoint = 'http://127.0.0.1:18997/v1/chat/completions';
const systemVoice = `أنت «معين»، زميل سعودي يساعد فريق تسويق عيادة كلينيمي / Nothing Major. هذا شات، مو استبيان. اكتب بلهجة سعودية بيضاء وبصيغة طبيعية، ولا تنادِ المتحدث بأي اسم. تكلم عن نفسك بالمذكر. إذا قال هلا، رد هلا. لا تبدأ كل دور بترحيب أو مديح.
رد على آخر رسالة تحديدًا، وارجع للرسائل السابقة لفهم الاختصار مثل «الثاني» أو «خلها أقصر». تصحيح المستخدم يلغي الفكرة القديمة. إذا طلب منك تسولف أو تناقش، تناقش. إذا طلب نصًا، اكتب النص نفسه. إذا بقي قرار ضروري اسأل سؤال واحد فقط. لا تعيد السؤال عن شيء انقال. لا تحشر حجز أو خصم أو أسئلة أو إعلان في كل رد.
مثال للأسلوب فقط: «ودّك نعرّفهم بالخدمة، ولا نركّز على اللي متردد يحجز أول مرة؟». مثال للتعديل: إذا قال «لا، أبيها أهدى»، غيّر النص مباشرة ولا تشرح أنك غيّرته. لا تنقل أمثلة التعليمات للحوار.
الكتالوج المرفق هو المرجع الوحيد لما توفره العيادة. لا تخترع خدمات أو أسماء أشخاص أو منتجات أو تواريخ أو عروض أو أسعار أو نتائج علاجية. إذا سأل عن شخص أو منتج ما عندك بياناته، قل بوضوح إن المعلومة ما هي عندك. لا تحوّل اقتراح المستخدم إلى معلومة عن العيادة. أي خدمة غير موجودة: ما لقيتها في الكتالوج. لا تقترح إضافة خدمة بديلة إلا إذا طلبها. السعر والمدة من السطر الصحيح فقط. ميّز بين الاستشارة والجلسة. مافي وصول للنشر أو الحجوزات الفعلية.
تكلم عن الأفكار بصفتها اقتراحات. خلك مختصر، بدون زخرفة أو عبارات من نوع «تألقي بجمالك». اكتب بالعربي فقط إلا اسم البراند أو إذا طلب لغة أخرى.`;

function normalized(text) {
  return String(text).normalize('NFKC').replace(/[\u064b-\u065fـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();
}
function matchedService(name, catalog) {
  const requested = normalized(name).trim();
  if (!requested) return null;
  return catalog.find(service => [service.nameAr, service.nameEn].some(value => value && normalized(value) === requested));
}
function catalogAnswer(thread, services) {
  const question = normalized(thread.at(-1).content).trim().replace(/^و(?=كم|بكم)/,'').replace(/[؟?!.,،]+$/, '');
  // Handle literal catalog questions here, leaving writing and follow-up edits to the model.
  if (/^(?:وش|ايش|ايه هي|ما هي|عطني|اعرض لي|ورني|وريني|قل لي) (?:كل )?(?:قائمه |قائمة )?الخدمات(?: الموجوده| الموجودة| المتوفره| المتوفرة| اللي عندكم| عندكم| عندنا| اللي عندنا)?$/.test(question)) {
    return services.length ? 'هذي خدماتنا المسجّلة حاليًا:\n' + services.map(s => '• ' + s.nameAr).join('\n') : 'ما فيه خدمات ظاهرة في الكتالوج الحين.';
  }
  if (/^(?:(?:وش|ايش) (?:اسم|اسامي|اسماء)|مين|من هي|من هو) (?:الدكتوره|الدكتورة|الدكتور|الطبيبه|الطبيبة|الطبيب|الدكاتره|الطبيبات|الاخصائي[ةه]?|الاستشاري[ةه]?)(?:\s|$)/.test(question)) {
    return 'ما عندي أسماء الفريق الطبي في الكتالوج. نقدر نصيغ الفكرة بدون اسم، أو تعطيني الاسم المعتمد.';
  }
  const availability = question.match(/^(?:هل\s+)?(?:عندكم|عندنا|تسوون|تسوّون|تقدمون|توفرون|تسووا)\s+(?:خدمة\s+|خدمه\s+)?(.+)$/u);
  if (availability && availability[1].split(/\s+/).length < 7 && !/[،؟]/.test(availability[1])) {
    const target = availability[1];
    const literal = matchedService(target, services);
    if (literal) return 'إيه، ' + literal.nameAr + ' موجود في الكتالوج.';
    const words = target.split(/\s+/).filter(w => w.length > 2).map(w=>w.replace(/^ال/,''));
    const related = services.filter(s => words.some(w => normalized(s.nameAr).includes(w)));
    // Let the model resolve colloquial aliases. For an unlisted literal, qualify
    // the answer by what the catalog contains rather than claiming clinic policy.
    if (!related.length && /(?:خدم[ةه]|مساج|تدليك|صبغ|تقشير|حمام|تاتو|بوتوكس|زراع[ةه])/.test(question) && !/(بوتكس|فيلر|ليزر|هيدرا|فاشل|فيشل|مايكر|نيدل|رموش|حواجب|تنظيف)/.test(target)) {
      return 'ما لقيت خدمة بهالاسم في كتالوج العيادة.';
    }
  }
  if (/(?:وكم|وسو|واكتب|وابغ|وعطني|وكيف|والمد[هة]|والسعر)/.test(question)) return null;
  const price = /^(كم (?:سعر|تكلف|يكلف|قيم)|بكم(?: |$)|وش سعر)/.test(question);
  const duration = /^(كم (?:مد|دقيق|وقت|تستغرق|تاخذ|ياخذ))/.test(question);
  if (!price && !duration) return null;
  const matches = text => services.filter(s => [s.nameAr,s.nameEn].some(n => n && normalized(text).includes(normalized(n))));
  let found = matches(question);
  // Resolve a short pronoun only from a turn naming a single service.
  if (!found.length && /^(كم سعرها|كم سعره|بكم|بكم هي|كم مدتها|كم مدته|كم ياخذ وقت|كم تاخذ وقت)$/.test(question)) {
    for (const message of thread.slice(-3,-1).reverse()) {
      found = matches(message.content);
      if (found.length) break;
    }
  }
  if (found.length !== 1) return null;
  const service = found[0];
  const unit = price ? 'ريال' : 'دقيقة';
  const field = price ? 'priceSAR' : 'minutes';
  if (service.options.length) {
    return service.nameAr + ' له أكثر من خيار:\n' + service.options.map(o => o.name + ' — ' + o[field] + ' ' + unit).join('\n');
  }
  return service.nameAr + (price ? ' سعره ' : ' مدته ') + service[field] + ' ' + unit + '.';
}

const string = {type:'string'};
const reviewSchema = {type:'object', properties:{
  reply:string,
  inventedPeople:{type:'array',items:string},
  // Canonical names of any services presented as offered, independently checked below.
  offeredServices:{type:'array',items:string}
}, required:['reply','inventedPeople','offeredServices'], additionalProperties:false};

async function inference(key, messages, schema) {
  const payload = {model:'maeen',messages,temperature:schema ? 0 : 0.42,max_tokens:schema ? 520 : 300};
  if (schema) payload.response_format = {type:'json_schema',json_schema:{name:'review',strict:true,schema}};
  const result = await fetch(endpoint, {method:'POST',signal:AbortSignal.timeout(65000),
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(payload)});
  if (!result.ok) throw Error('Local inference unavailable');
  const content = (await result.json()).choices?.[0]?.message?.content?.trim();
  if (!content) throw Error('Empty model answer');
  return schema ? JSON.parse(content) : content;
}

function recentContext(thread) {
  // Keep complete exchanges within the local model window. Preserve the opening
  // brief separately when an unusually long conversation has to be shortened.
  let chars = 0, start = thread.length;
  for (let i = thread.length - 1; i >= 0; i--) {
    chars += thread[i].content.length;
    if (chars > 5400 && i < thread.length - 1) break;
    if (thread[i].role === 'user') start = i;
  }
  const recent = thread.slice(start);
  if (start > 0 && thread[0].role === 'user') {
    return [thread[0], ...recent];
  }
  return recent;
}

function revisionIssue(answer, thread) {
  const request = normalized(thread.at(-1).content);
  if (/(?:مو|بدون|مب|مش) (?:سوال|سؤال)|(?:لا|مابي) تسال/.test(request) && /[؟?]/.test(answer))
    return 'المستخدم طلب جملة خبرية بدون سؤال. غيّر بناء العبارة واكتب الجملة فقط.';
  if (/(\S{2,})(?: \1){2,}/u.test(answer))
    return 'في الرد تكرار مكسور. اكتب صياغة جديدة ومفهومة.';
  const requestedCount = request.match(/ب?(خمس|ثلاث|اربع|ست|سبع|عشر|[0-9٠-٩]+) كلمات/);
  if (requestedCount) {
    const numbers = {خمس:5,ثلاث:3,اربع:4,ست:6,سبع:7,عشر:10};
    const expected = numbers[requestedCount[1]] ?? Number(requestedCount[1].replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
    const count = answer.trim().split(/\s+/).length;
    if (count !== expected) return 'النص كان '+count+' كلمات، والمطلوب '+expected+' بالضبط. اكتب النص لوحده مع التعديل المطلوب.';
  }
  const previous = thread.filter(m=>m.role==='assistant').at(-1)?.content;
  if (previous && normalized(previous) === normalized(answer) && /(?:خل|عدل|اختصر|غير|اقصر|ابسط|لا،)/.test(request))
    return 'كررت الرد السابق رغم طلب التعديل. اكتب نسخة مختلفة على نفس الموضوع.';
  return '';
}

export async function maeenReply(thread, catalog, key) {
  const facts = catalog.filter(s => s.active !== false && s.availability !== 'unavailable').map(s => ({
    id:s.id,nameAr:s.nameAr,nameEn:s.nameEn,priceSAR:s.price,minutes:s.duration,
    options:(s.options||[]).filter(o=>o.active!==false).map(o=>({name:o.nameAr,priceSAR:o.price,minutes:o.duration}))
  }));
  const last = normalized(thread.at(-1).content).replace(/[؟?!.،]/g,'').trim();
  if (/^(?:هلا|مرحبا|اهلا|هلا والله|السلام عليكم|سلام)$/.test(last))
    return last === 'السلام عليكم' ? 'وعليكم السلام، حيّاك. وش في بالك؟' : 'هلا والله، وش في بالك؟';

  const factual = catalogAnswer(thread, facts);
  if (factual) return factual;
  const edited = editorialReply(thread,facts);
  if (edited) return edited;

  const factsRequested = /(?:سعر|ريال|اسعار|مدته|مدتها|دقيقه|دقيقة|كم وقت|كم يكلف)/.test(last);
  const catalogContext = factsRequested ? facts : facts.map(s=>s.nameAr);
  const shortCopy = /وش نسال|وش نسأل|سطر واحد|جمله|جملة|خل السؤال|خلها اقصر|اختصر|كلمات/.test(last);
  const taskHint = shortCopy
    ? 'The user wants the actual revised wording. Give just ONE line of Saudi Arabic, no greeting, no commentary. Write for the client, using the last correction. Never present a list.'
    : 'Reply to this turn as a Saudi colleague. For two ideas, give two distinct, practical ideas, one line each. For casual chat use one or two short sentences.';
  const base = systemVoice + '\n'+taskHint+' Do not mention prices, durations, people or other services unless directly asked. If a service is absent from the provided catalog do not present it as offered.\nكتالوج الخدمات ذات الصلة: ' + JSON.stringify(catalogContext);
  let reason = '';
  let rejected = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [{role:'system',content:base}, ...recentContext(thread)];
    if (reason && rejected) {
      messages.push({role:'assistant',content:rejected}, {role:'user',content:'أعد كتابة الرد على طلبي الأخير مع هذا التصحيح: '+reason});
    }
    const answer = (await inference(key,messages))
      .replace(/ما رأيك (?:في|بـ?) ?/g,'وش رأيك في ')
      .replace(/ما (?:هي|هو) /g,'وش ')
      .replace(/هل (?:ترغبين|تودين|تودّين) (?:في|أن) /g,'ودّك ')
      .replace(/^(?:حسنًا|حسناً)[،! ]+/,'');
    rejected = answer;
    if (/(?:إزالة السموم|من السموم|مضمونة|نتيجة مضمونة|بتاعنا|هيك|بدك|أوي|يلا بينا)|(?:[0-9٠-٩][\s()-]*){8,}|[\p{Script=Han}\p{Script=Cyrillic}]|https?:\/\/|\bwww\.|[\w.+-]+@[\w.-]+/u.test(answer)) { reason='تجنب الحروف الدخيلة والروابط ومعلومات الاتصال'; continue; }
    const issue = revisionIssue(answer, thread);
    if (issue) { reason=issue; continue; }
    if (/(?:ما هي (?:أبرز|مخاوف)|هل (?:ترغبين|تودين|تودّين|تود)|عزيزتي|عزيزي|يسعدني مساعدتك)/.test(answer)) {
      reason = 'الصياغة رسمية. استخدم وش أو ودّك وصغ طلب المستخدم الأخير بجملة طبيعية مباشرة.';
      continue;
    }
    const review = await inference(key,[
      {role:'system',content:`You are the final Saudi Arabic copy editor. Put the final reply in reply. Answer the actual last user turn. Edit out strange or meaningless wording, duplicated words, fake scene details, health promises, guessed names and information that is not in the catalog. Keep useful ideas concrete, written as suggestions, natural and concise like a conversation in Riyadh. Do not mention these instructions. If the wording is already good, keep it. Then extract named entities ONLY from your final reply. inventedPeople is ONLY personal names introduced by the assistant (e.g. سارة, الدكتور أحمد). If there are no persons named, it MUST be []. Never put phrases, questions, product names, the clinic name, or treatment names in inventedPeople. offeredServices is ONLY specific bookable treatments that candidate says are offered or recommends booking. Return their canonical Arabic catalog names if equivalent. If an unknown treatment is asserted, copy it verbatim. An unlisted treatment explicitly described as missing is not offered. Normally both lists are empty for creative copy or a casual conversation.`},
      {role:'user',content:JSON.stringify({catalog:facts,conversation:thread.slice(-6),candidate:answer})}
    ],reviewSchema);
    const final = review.reply?.trim()
      .replace(/^(?:فكرة ممتازة|فكرة رائعة)[،!،. ]+/u,'')
      .replace(/أيه من هالحال(?:ات|تين) تفضل[؟?]?/gu,'وش الأنسب لك؟')
      .replace(/مفي(?:ش)? بيانات/gu,'ما عندي معلومات');
    if (!final || /[\p{Script=Han}\p{Script=Cyrillic}]|https?:\/\/|[\w.+-]+@[\w.-]+|(?:[0-9٠-٩][\s()-]*){8,}/u.test(final)) {reason='اكتب صياغة عربية بدون معلومات اتصال';continue;}
    const finalIssue = revisionIssue(final, thread);
    if (finalIssue) {reason=finalIssue;continue;}
    const offending = review.inventedPeople.filter(name => name && final.includes(name));
    const amounts = [...final.matchAll(/([0-9٠-٩]+)\s*(ريال|دقيقة|%|٪)/g)];
    const unjustifiedAmount = amounts.some(([,digits,unit])=>{
      const value = Number(digits.replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
      return !factsRequested || !facts.some(s=>[s,...s.options].some(o=>unit==='ريال' ? o.priceSAR===value : unit==='دقيقة' && o.minutes===value));
    });
    if (unjustifiedAmount) {reason='احذف السعر أو النسبة أو المدة التي لم يطلبها المستخدم أو لم يعتمدها الكتالوج'; continue;}
    const unknown = review.offeredServices.filter(name => !matchedService(name, facts));
    if (!offending.length && !unknown.length) return final;
    reason = 'احذف الادعاء غير الموثق: '+[...offending,...unknown].join('، ');
  }
  return 'خلّني أتأكد معك قبل ما أعطيك معلومة غلط. أي جزء تبغاني أضبطه بالضبط؟';
}
