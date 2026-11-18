import test from 'node:test';
import assert from 'node:assert/strict';
import { maeenReply } from '../scripts/maeen-dialogue.mjs';

const service = {nameAr:'تنظيف البشرة الأساسي',nameEn:'Basic Facial',price:275,duration:45};
const hidden = {nameAr:'خدمة متوقفة',active:false,price:300,duration:30};
const reply = (...messages) => maeenReply(messages.map((content,i) => ({role:i%2?'assistant':'user',content})),[service,hidden],'');
test('direct factual replies use current catalog values, including a short follow-up', async () => {
  const question='كم سعر تنظيف البشرة الأساسي؟';
  const price=await reply(question);
  assert.match(price,/275 ريال/);
  assert.match(await reply(question,price,'وكم مدته؟'),/45 دقيقة/);
});
test('absence and identity questions never invent a service or a clinician',async()=>{
  assert.match(await reply('تسوّون مساج بالأحجار البركانية؟'),/ما لقيت/);
  assert.match(await reply('وش اسم الدكتورة؟'),/ما عندي أسماء/);
  const catalog=await reply('وش الخدمات اللي عندكم؟');
  assert.ok(catalog.includes(service.nameAr));
  assert.ok(!catalog.includes(hidden.nameAr));
});
