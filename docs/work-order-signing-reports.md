# Revalta – signering, arbetsrapport och fakturaunderlag

Denna leverans bygger nästa steg ovanpå den professionella arbetsordern.

## Mål

En avslutad arbetsorder ska kunna:

- signeras av utförare och beställare
- sammanställas som en utskriftsvänlig arbetsrapport
- innehålla checklista, tid, material, resor, externa kostnader och före-/efterbilder
- skapa ett granskningsbart fakturaunderlag
- visa vem som godkänt vad och när
- behålla full tenant-säkerhet och revisionshistorik

## Datamodell

### WorkOrderSignature

- organisation och arbetsorder
- signerande part: utförare, beställare eller entreprenör
- namn, roll och eventuell organisation
- signerad tid
- signaturdata eller signaturreferens
- IP-/enhetsmetadata när sådan finns
- skapad av och revisionslogg

### WorkOrderReportSnapshot

- arbetsorder och organisation
- rapportnummer och version
- fryst JSON-sammanställning av arbetsorderns innehåll
- skapad av och skapad tid
- status: utkast, fastställd eller ersatt

### WorkOrderInvoiceBasis

- arbetsorder och organisation
- status: utkast, granskning, godkänd eller fakturerad
- kund-/beställarreferens
- summerad tid, material, resa och externa kostnader
- påslag, momsmetadata och totalbelopp
- låst underlag efter godkännande
- koppling till rapportversion

## Arbetsflöde

1. Arbetsordern slutförs genom befintlig slutkontroll.
2. Utföraren signerar utfört arbete.
3. Beställare eller ansvarig kan signera godkännande.
4. Revalta genererar en fryst arbetsrapport.
5. Ekonomiskt underlag skapas från registrerade poster.
6. Underlaget granskas och godkänns innan fakturering.
7. Alla händelser skrivs till revisionsloggen.

## Leveransordning

1. Additiv migration för signatur, rapportversion och fakturaunderlag.
2. Tenant-säkra API:er.
3. Signeringspanel i arbetsorderdetaljen.
4. Utskriftsvänlig rapportvy.
5. Fakturaunderlag med summeringar och granskningsstatus.
6. Mobil- och tillgänglighetsgranskning.
7. Full lint-, Prisma- och produktionsbuild.
