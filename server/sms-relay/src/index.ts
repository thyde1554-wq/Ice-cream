export interface Env {
  APP_SHARED_SECRET: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;
  RATE_LIMIT_KV: KVNamespace;
  MAX_DAILY_PER_RECIPIENT?: string;
  MAX_DAILY_TOTAL?: string;
}

const DEFAULT_MAX_PER_RECIPIENT = 5;
const DEFAULT_MAX_TOTAL = 50;
const KV_ENTRY_TTL_SECONDS = 60 * 60 * 26; // a little over a day, so a UTC-midnight key always expires

function todayKey(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `${prefix}:${date}`;
}

/** Atomically-enough increments a daily counter and reports whether it was still under `limit`. */
async function incrementAndCheck(kv: KVNamespace, key: string, limit: number): Promise<boolean> {
  const current = Number((await kv.get(key)) ?? '0');
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: KV_ENTRY_TTL_SECONDS });
  return true;
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const providedSecret = request.headers.get('x-app-secret');
    if (!env.APP_SHARED_SECRET || providedSecret !== env.APP_SHARED_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let body: { to?: string; message?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const to = (body.to ?? '').trim();
    const message = (body.message ?? '').trim();

    if (!isValidE164(to)) {
      return json({ error: 'to must be E.164 format, e.g. +15551234567' }, 400);
    }
    if (!message || message.length > 300) {
      return json({ error: 'message is required and must be 300 characters or fewer' }, 400);
    }

    const maxPerRecipient = Number(env.MAX_DAILY_PER_RECIPIENT ?? DEFAULT_MAX_PER_RECIPIENT);
    const maxTotal = Number(env.MAX_DAILY_TOTAL ?? DEFAULT_MAX_TOTAL);

    const recipientOk = await incrementAndCheck(
      env.RATE_LIMIT_KV,
      todayKey(`recipient:${to}`),
      maxPerRecipient
    );
    if (!recipientOk) {
      return json({ error: 'Daily message limit reached for this recipient' }, 429);
    }

    const totalOk = await incrementAndCheck(env.RATE_LIMIT_KV, todayKey('total'), maxTotal);
    if (!totalOk) {
      return json({ error: 'Daily total message limit reached' }, 429);
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const form = new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: message });
    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      return json({ error: `Twilio error: ${errorText}` }, 502);
    }

    return json({ ok: true }, 200);
  },
};
