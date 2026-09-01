# Revalta integrationer

Revalta kan använda deterministiska eller lokala fallback-lägen för flera interna funktioner när externa providers saknas. Funktioner som innebär extern leverans eller permanent filhantering får däremot inte rapportera falsk framgång: de failar tydligt när nödvändig produktionskonfiguration saknas.

## E-post

Rekommenderad provider: Resend.

Miljövariabler:

- `EMAIL_PROVIDER_API_KEY`
- `EMAIL_FROM`
- `DEMO_REQUEST_TO` — server-side mottagare för publika demoförfrågningar

När provider-nyckel och avsändare finns kan Revalta skicka e-post via Resend för bland annat:

- e-postverifiering
- lösenordsåterställning
- ärendekvitto
- statusuppdateringar
- nya kommentarer
- serviceaviseringar

### Publika demoförfrågningar

`POST /api/demo-request` är en fail-closed publik kontaktkanal. Den kräver både den gemensamma e-postkonfigurationen och `DEMO_REQUEST_TO` för att returnera leveransframgång.

Säkerhetskontrakt:

- same-origin-kontroll för mutationer
- bounded JSON-fält och request-size-guard
- honeypot för automatiserad spam
- persistent rate limit per IP och normaliserad e-postidentitet
- besökarens e-post används som `reply_to`, aldrig som serverbestämd mottagare
- HTML-escaping av samtliga besökarstyrda fält
- provider-timeout och standardiserad `503 SERVICE_UNAVAILABLE` om leverans inte kan bekräftas
- `private/no-store` för origin och CDN samt request-correlation för felsökning

`DEMO_REQUEST_TO` ska sättas explicit i Vercel Production och Preview där demoflödet ska kunna leverera. Lägg inte in en påhittad mottagaradress i källkoden.

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