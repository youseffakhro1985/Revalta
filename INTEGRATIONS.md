# Revalta integrationer

Revalta fungerar fullt i mockläge utan externa nycklar. När nycklar finns i Vercel aktiveras live-läge automatiskt för respektive provider.

## E-post

Rekommenderad provider: Resend.

Miljövariabler:

- `EMAIL_PROVIDER_API_KEY`
- `EMAIL_FROM`

När dessa finns skickar Revalta e-post via Resend för:

- e-postverifiering
- lösenordsåterställning
- ärendekvitto
- statusuppdateringar
- nya kommentarer

## SMS

SMS skickas via en konfigurerbar webhook så du kan använda 46elks, Twilio, Make, Zapier eller egen endpoint.

Miljövariabler:

- `SMS_PROVIDER_API_KEY`
- `SMS_PROVIDER_WEBHOOK_URL`

Revalta skickar JSON:

```json
{
  "to": "0701234567",
  "message": "Meddelande från Revalta"
}
```

## Stripe

Miljövariabler:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_START`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_ENTERPRISE`

När dessa finns kan Revalta starta Stripe Checkout för planerna. Customer Portal kan öppnas när ett Stripe customer-id finns tillgängligt. Utan nycklar loggas checkout och customer portal i mockläge.

## Filstorage

Miljövariabel:

- `STORAGE_PROVIDER_KEY`

I nuvarande version sparas små dev-bilagor som data-URL för att flödet ska vara testbart. Nästa steg är att ersätta lagringen med Vercel Blob, S3 eller Supabase Storage.

## AI

AI använder en OpenAI-kompatibel endpoint när nyckel finns.

Miljövariabler:

- `AI_PROVIDER_API_KEY`
- `AI_PROVIDER_API_URL` (valfri, default: `https://api.openai.com/v1/chat/completions`)
- `AI_PROVIDER_MODEL` (valfri, default: `gpt-4o-mini`)

Utan nyckel använder Revalta deterministisk svensk fallback-analys.
