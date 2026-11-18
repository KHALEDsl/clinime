export function createResendMail({ apiKey, from, fetcher = fetch }) {
  return { async send({ to, subject, text, html, key }) {
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ from, to: [to], subject, text, ...(typeof html === 'string' && html ? { html } : {}) })
      });
      if (response.ok) { const value = await response.json(); return value.id ? { status: 'sent' } : { status: 'pending' }; }
      return { status: response.status >= 500 || response.status === 429 || response.status === 408 || response.status === 409 ? 'pending' : 'failed' };
    } catch { return { status: 'pending' }; }
  } };
}
