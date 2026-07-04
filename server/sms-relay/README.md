# Churn Watch SMS relay

A tiny Cloudflare Worker that relays "ice cream is ready" texts through
Twilio. It exists because the app itself can't safely hold Twilio's
secret credentials, and neither iOS nor Android allow apps to send SMS
programmatically.

The endpoint enforces a shared-secret header plus a daily per-recipient
and global message cap (stored in Workers KV) so a leaked secret or
runaway client bug can't blow up the Twilio bill unbounded.

## One-time setup

```sh
cd server/sms-relay
npm install

# Create the KV namespace used for rate-limit counters, then paste the
# printed id into wrangler.toml's [[kv_namespaces]] id field.
npx wrangler kv namespace create RATE_LIMIT_KV

# Set secrets (never committed to the repo):
npx wrangler secret put APP_SHARED_SECRET     # any random string; the app must send it back
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER    # your Twilio number, E.164 format

npm run deploy
```

Deploying prints the Worker's URL (`https://churn-watch-sms-relay.<your-subdomain>.workers.dev`).
Put that URL and the same `APP_SHARED_SECRET` value into the app's
`src/notifications/smsRelay.ts` config so it can call this endpoint.

## API

```
POST /
X-App-Secret: <shared secret>
Content-Type: application/json

{ "to": "+15551234567", "message": "🍦 Ice cream is ready!" }
```

Returns `200 {"ok": true}` on success, `429` if a rate limit was hit,
`401` if the secret didn't match, `400` for bad input, `502` if Twilio
itself rejected the request.
