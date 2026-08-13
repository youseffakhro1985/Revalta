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

SMS kan skickas via en konfigurerbar webhook eller direkt via 46elks.

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

För 46elks kan `SMS_PROVIDER_API_KEY` sättas i formatet:

```text
46elks:USERNAME:PASSWORD:AVSÄNDARE
```

och `SMS_PROVIDER_WEBHOOK_URL` kan sättas till:

```text
https://api.46elks.com/a1/sms
```

## Stripe

Miljövariabler:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_START`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_ENTERPRISE`

När dessa finns kan Revalta starta Stripe Checkout för planerna. Customer Portal kan öppnas när ett Stripe customer-id finns tillgängligt. Utan nycklar loggas checkout och customer portal i mockläge.

Nuvarande planmappning:

- `STRIPE_PRICE_START` → Revalta Start
- `STRIPE_PRICE_PROFESSIONAL` → Revalta Standard
- `STRIPE_PRICE_ENTERPRISE` → Revalta Professional

Webhook endpoint:

```text
https://www.revalta.se/api/stripe/webhook
```

Aktivera minst dessa events i Stripe:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Filstorage

Miljövariabel:

- `BLOB_READ_WRITE_TOKEN` (privat Vercel Blob-token — detta är den aktiva lagringen i produktion)
- `STORAGE_PROVIDER_KEY` (stöds endast som övergångsreserv om `BLOB_READ_WRITE_TOKEN` saknas)

Bilagor laddas upp till privat Vercel Blob-lagring via `src/lib/storage.ts` (`storeAttachment`). Utan någon av nycklarna kastas `StorageConfigurationError` och uppladdning är inte möjlig.

## AI

AI använder en OpenAI-kompatibel endpoint när nyckel finns.

Miljövariabler:

- `AI_PROVIDER_API_KEY`
- `AI_PROVIDER_API_URL` (valfri, default: `https://api.openai.com/v1/chat/completions`)
- `AI_PROVIDER_MODEL` (valfri, default: `gpt-4o-mini`)

Utan nyckel använder Revalta deterministisk svensk fallback-analys.
