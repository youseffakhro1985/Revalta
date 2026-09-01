# Stripe webhook — idempotency och replay

Den här runbooken beskriver Revaltas säkra behandling av `POST /api/stripe/webhook`.

## Livscykel

- Stripe-signaturen verifieras före JSON-tolkning eller databasåtkomst.
- Stödda event serialiseras per Stripe `event.id` med en PostgreSQL advisory transaction lock.
- Ett nytt matchat event behandlas och journalförs som `IntegrationEvent(type="stripe", status="received", recipient=<event.id>)` i samma transaktion som eventuell bolagsuppdatering.
- Ett nytt event som ännu inte kan kopplas säkert till ett bolag journalförs som `ignored` utan tenantmutation.
- Ett redan `received` event är terminalt och returneras som en idempotent duplicate utan ny mutation.
- Ett tidigare `ignored` event är replaybart. Samma Stripe `event.id` utvärderas på nytt under samma lås och samma journalrad uppdateras. Om bolagsmappningen nu finns går status till `received`; annars förblir den `ignored`.
- Databasfel ger 500 och transaktionen rullas tillbaka så Stripe kan försöka leverera igen.

## Event-specifik mutation

`Company.subscription_status` ägs endast av `customer.subscription.created`, `customer.subscription.updated` och `customer.subscription.deleted`.

`checkout.session.completed` får binda kund, abonnemang och plan, men checkout-status (`complete`, `open`, etc.) får inte skrivas som abonnemangsstatus.

`invoice.payment_succeeded` och `invoice.payment_failed` används för matchning och journalföring men får inte skriva fakturastatus (`paid`, `open`, etc.) till `Company.subscription_status`.

## Säker replay

Återposta inte en gammal rå webhook-request manuellt. Stripe-signaturen har ett tidsfönster och en gammal header ska därför avvisas.

För ett legitimt tidigare `ignored` event:

1. verifiera att rätt `stripe_customer_id` / `stripe_subscription_id` eller betrodd `metadata.companyId` nu kan koppla eventet till avsett bolag,
2. använd Stripes dashboard/CLI eller motsvarande officiell resend-funktion för att skicka samma `event.id` på nytt med en färsk Stripe-signatur,
3. kontrollera att Revalta svarar 2xx,
4. verifiera att den befintliga `IntegrationEvent`-raden har gått från `ignored` till `received` och att `replayCount` ökats,
5. kontrollera bolagets Stripe-fält endast för eventtyper som får mutera dem.

Om replay fortfarande blir `ignored`, ändra inte tenantkoppling eller metadata på chans. Utred kund-/subscription-mappningen först.

## Observability

Loggar får innehålla Stripe event-ID, eventtyp, request-ID och om replay matchade ett bolag. Rå webhook-payload, signatur, API-nycklar och andra secrets ska inte loggas.
