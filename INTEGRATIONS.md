# Revalta integrationer

Revalta kan registrera spårbara integrationshändelser utan externa nycklar. Det innebär inte att ett externt meddelande eller en betalning har levererats. När respektive nyckel finns i Vercel aktiveras live-läge för den providern och leveransstatus sparas separat.

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

SMS skickas via en konfigurerbar webhook. Om webhook saknas kan `SMS_PROVIDER_API_KEY` senare anpassas till en specifik leverantör i kod, men rekommenderad produktionsväg är webhook via Make/Zapier/eget API eller en tunn serverless endpoint framför Twilio/46elks.

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

Miljövariabler:

- `BLOB_READ_WRITE_TOKEN` (kanonisk)
- `STORAGE_PROVIDER_KEY` (tillfällig kompatibilitetsreserv)

Nya bilagor och dokument lagras som privata Vercel Blob-objekt efter storleks-, MIME- och filsignaturkontroll. Databasen lagrar endast lagringsreferens och metadata. Klienten får en intern API-adress; varje nedladdning autentiseras och tenantkontrolleras på servern. Äldre data-URL-bilagor kan läsas via en validerad kompatibilitetsväg tills en separat, inventerad datamigrering har genomförts.

## AI

AI använder en OpenAI-kompatibel endpoint när nyckel finns.

Miljövariabler:

- `AI_PROVIDER_API_KEY`
- `AI_PROVIDER_API_URL` (valfri, default: `https://api.openai.com/v1/chat/completions`)
- `AI_PROVIDER_MODEL` (valfri, default: `gpt-4o-mini`)

Utan nyckel använder Revalta deterministisk svensk fallback-analys.
