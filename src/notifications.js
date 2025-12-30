// Helper para enviar notificações via WhatsApp/API externa.
// Suporta dois modos:
// - genérico: usa WA_API_URL + WA_API_TOKEN e envia JSON { to, message }
// - twilio: usa TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN e faz POST para Twilio Messages API
// Variáveis esperadas:
// - WA_PROVIDER: 'twilio' | 'generic' (opcional)
// - WA_API_URL, WA_API_TOKEN (para provider genérico)
// - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, WA_FROM (para Twilio)
// - ADMIN_WHATSAPP: número do admin (ex: 5511999999999)

function ensurePlus(number) {
  if (!number) return number;
  return number.startsWith('+') ? number : `+${number}`;
}

async function sendWhatsAppGeneric(to, message) {
  const url = process.env.WA_API_URL;
  const token = process.env.WA_API_TOKEN;
  if (!url || !token || !to) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ to, message })
    });
  } catch (err) {
    console.error('sendWhatsApp generic error', err);
  }
}

async function sendWhatsAppTwilio(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.WA_FROM || 'whatsapp:+14155238886'; // Twilio sandbox default
  if (!accountSid || !authToken || !to) return;
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const body = new URLSearchParams();
    const toFormatted = to.startsWith('+') ? to : `+${to}`;
    body.append('To', `whatsapp:${toFormatted}`);
    body.append('From', from);
    body.append('Body', message);

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
  } catch (err) {
    console.error('sendWhatsApp twilio error', err);
  }
}

async function sendWhatsApp(to, message) {
  const provider = (process.env.WA_PROVIDER || '').toLowerCase() || (process.env.WA_API_URL ? 'generic' : 'twilio');
  console.log(`[WA] to=${to} message=${message} provider=${provider}`);
  if (!to) return;
  if (provider === 'twilio') return sendWhatsAppTwilio(ensurePlus(to), message);
  return sendWhatsAppGeneric(ensurePlus(to), message);
}

module.exports = { sendWhatsApp };
