// Reviewed Saudi copy for recurring studio requests. Custom briefs stay with the model.
const formatIdeas = [
  {
    label:'لقطة من الجلسة', idea:name=>'نصوّر تجهيز الغرفة قبل '+name+'، ونفتح صندوق أسئلة عن الجلسة.',
    line:name=>'وش ودّك تعرفين عن جلسة '+name+'؟'
  },
  {
    label:'قبل أول زيارة', idea:name=>'ننزل تصويت للي بتجرّب '+name+' أول مرة: «وش يهمّك تعرفين قبل تحجزين؟ خطوات الجلسة / مدتها».',
    line:()=>'أول مرة تزورينا؟ وش يهمّك تعرفين قبل تجين؟'
  }
];
const normalize = text => text.replace(/[\u064b-\u065fـ]/g,'').replace(/[أإآ]/g,'ا');
export function editorialReply(thread, facts) {
  const request = normalize(thread.at(-1).content).trim();
  const recent = thread.slice(-5).map(m=>normalize(m.content)).join(' ');
  const matches = facts.filter(s=>normalize(thread.at(-1).content).includes(normalize(s.nameAr)));
  const format = /ستوري|ستوريات/.test(recent);
  if (!format) return null;
  // Only take simple briefs. Requests about a different channel, a named person,
  // an offer or a new factual detail need the regular grounded conversation.
  if (/(?:فيديو|ريلز|بوست|مو ستوري|انجليز|وش سعر|كم سعر|عرض خاص|ابي خصم|ابيها عن|غير الخدمة|بدل الخدمة)/.test(request)) return null;
  const previous = thread.filter(m=>m.role==='assistant').at(-1)?.content || '';
  const name = matches.length===1 ? matches[0].nameAr : undefined;
  if (name && /فكرتين/.test(request) && /ستوري/.test(request) && request.split(/\s+/).length <= 12 && !/(?:عيد|رمضان|تصوير منتج|مناسب[هة]|اسبوع|فيديو|عميل|رجال)/.test(request)) {
    return formatIdeas.map((f,i)=>(i===0?'١. ':'٢. ')+f.label+' — '+f.idea(name)).join('\n\n');
  }
  const ordinal = /(?:الثاني[هة]|رقم (?:٢|2))/.test(request) ? 1 : /(?:الاول[ىي]|رقم (?:١|1))/.test(request) ? 0 : -1;
  if (ordinal>=0 && formatIdeas.every(f=>previous.includes(f.label)) && /سطر واحد|النص|اكتبها/.test(request)) {
    const services = facts.filter(s=>previous.includes(s.nameAr));
    if (services.length===1) return formatIdeas[ordinal].line(services[0].nameAr);
  }
  if (/وش نسال (?:العميلة|الزبونة)/.test(request) && name && request.split(/\s+/).length<=14 && !/اول زيارة|بعد|قبل|خصم|رجال/.test(request)) {
    return 'ممكن نسألها: «وش ودّك تعرفين عن '+name+' قبل تحجزين؟»';
  }
  // Compact first-visit follow-ups to a visitor question. Honor the current
  // correction first. Explicit new topics fall through to free-form inference.
  const firstVisit = /اول زيارة/.test(request) || /اول زيارة/.test(normalize(previous));
  if (!firstVisit || !/س[ؤو]ال|نسال|سطر|كلمات|اختصر/.test(request)) return null;
  if (/منتج|هدي[هة]|سعر|وقت|مد[ةه]|موقع|فرع|طبيب|تحدي|استبيان|بالانجليزي|غير اول زيارة/.test(request)) return null;
  if (/جمل[ةه] (?:مو|بدون) س[ؤو]ال|بدون س[ؤو]ال/.test(request) && request.split(/\s+/).length<=8)
    return 'قبل أول زيارة، اكتبي لنا وش ودّك تعرفين.';
  if (/خمس كلمات|[٥5] كلمات/.test(request) && /اول زيارة/.test(request))
    return 'وش يهمّك قبل أول زيارة؟';
  return null;
}
