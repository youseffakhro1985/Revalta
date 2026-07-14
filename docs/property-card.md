# Revalta – Fastighetskortet

Fastighetskortet ska fungera som en komplett digital fastighetspärm för svenska fastighetsägare, BRF:er och förvaltare.

## Grundprinciper

- Befintliga modeller för fastighet, byggnad och enhet återanvänds.
- Alla nya poster tillhör organisation och fastighet.
- Historik och revisionslogg ska finnas för viktiga förändringar.
- Datamodellen ska vara additiv och inte påverka befintliga fastigheter.
- Gränssnittet ska vara snabbt, mobilanpassat och följa Revaltas svenska premiumdesign.

## Första vertikalen

### Trapphus och byggnadsdelar
- koppling till fastighet och valfri byggnad
- namn eller beteckning
- adress/entré
- antal våningar
- tillgänglighetsinformation
- status och anteckning

### Tekniska installationer
- kategori: hiss, ventilation, värme, el, VA, brand, lås/passersystem eller övrigt
- namn, fabrikat, modell och serienummer
- installationsdatum
- senaste och nästa service
- placering
- driftstatus och kritikalitet
- ansvarig entreprenör

### Garantier
- typ och omfattning
- leverantör
- start- och slutdatum
- kontaktuppgifter
- dokumentreferens
- status

### Besiktningar
- typ av besiktning
- planerat och utfört datum
- resultat och status
- besiktningsföretag
- ansvarig kontakt
- nästa förfallodatum
- sammanfattning och dokumentreferens

### Serviceavtal
- leverantör och avtalsnummer
- avtalsområde
- start, slut och uppsägningstid
- kostnad och intervall
- kontaktperson
- status och dokumentreferens

## Första användarflödet

1. Förvaltaren öppnar en fastighet.
2. Översikten visar byggnader, enheter, installationer, garantier, besiktningar och öppna arbetsorder.
3. Användaren kan lägga till och uppdatera poster utan att lämna fastighetskortet.
4. Kommande service, garantislut och besiktningar visas tydligt.
5. Relaterade arbetsordrar och projekt är klickbara.
6. Alla ändringar loggas och filtreras per organisation.

## Leveransordning

1. Additiv migration och tenant-säkra API-kontrakt.
2. Samlad fastighetsöversikt med nyckeltal.
3. Trapphus och tekniska installationer.
4. Garantier, besiktningar och serviceavtal.
5. Dokument, historik och relaterade arbetsorder/projekt.
6. Mobil-, tillgänglighets- och premiumgranskning.
