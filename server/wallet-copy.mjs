// Wallet copy follows Clinime's short, warm product voice. Messages can appear
// on a lock screen: never add patient names, service names, prices or record IDs.
const dateFormat = locale => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-arab', {
  calendar: 'gregory', timeZone: 'Asia/Riyadh', weekday: locale === 'en' ? 'short' : 'long', day: 'numeric', month: locale === 'en' ? 'short' : 'long',
});
const timeFormat = locale => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ar-SA-u-ca-gregory-nu-arab', {
  calendar: 'gregory', timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit', hour12: true,
});
export function bookingWalletMessage(booking, action) {
  const locale = booking.locale === 'en' ? 'en' : 'ar';
  const instant = new Date(`${booking.date}T${booking.time}:00+03:00`);
  const date = dateFormat(locale).format(instant).replaceAll('،', '').replaceAll(',', '');
  const time = timeFormat(locale).format(instant);
  if (locale === 'en') {
    if (action === 'cancel') return `Your appointment on ${date} at ${time} (Riyadh time) was cancelled.`;
    if (action === 'update') return `Your appointment was updated. See you on ${date} at ${time}, Riyadh time.`;
    return `Your appointment is confirmed. See you on ${date} at ${time}, Riyadh time.`;
  }
  if (action === 'cancel') return `أُلغي موعدك يوم ${date}، الساعة ${time} بتوقيت الرياض.`;
  if (action === 'update') return `تعدّل موعدك. ننتظرك ${date}، الساعة ${time} بتوقيت الرياض.`;
  return `موعدك تأكد. ننتظرك ${date}، الساعة ${time} بتوقيت الرياض.`;
}

export function giftWalletMessage(kind, locale = 'ar') {
  if (locale === 'en') return kind === 'sender'
    ? 'You gifted your reward. View the details in My rewards.'
    : 'A gift for you. Book it in My rewards.';
  return kind === 'sender'
    ? 'أهديتِ مكافأتك. تفاصيل الهدية في «مكافآتي».'
    : 'وصلتك هدية. اختاري موعدها من «مكافآتي».';
}

// These two notifications are controlled by the Loopy campaign, not card/push.
// Keep {#} intact: Loopy replaces it with stamps remaining, not stamps earned.
// This is a reviewed local proposal until applied to the live campaign.
export const WALLET_PROVIDER_COPY = Object.freeze({
  stamp: 'أضفنا ختم زيارتك. باقي {#} لمكافأتك.',
  reward: 'مكافأتك جاهزة لكِ. احجزيها أو أهديها من «مكافآتي».',
});
