# Revalta – Arbetsorder 2.0

Arbetsorder 2.0 vidareutvecklar den befintliga arbetsordermodulen till ett komplett operativt arbetsflöde för svenska fastighetsägare, BRF:er och förvaltare.

## Första tekniska vertikalen

- organisationsunikt arbetsordernummer i formatet `WO-ÅÅÅÅ-000001`
- full statushistorik med aktör, tidpunkt, tidigare status och ny status
- SLA för första respons och slutlig lösning
- prioritet och akutflöde
- koppling till fastighet, byggnad, objekt och teknisk komponent
- stöd för avhjälpande, förebyggande, besiktning, akut, projekt och garanti
- källa från felanmälan, underhållsplan, besiktning, komponent, boende eller leverantör
- pausorsak, väntelägen, besiktningskrav och fakturerbarhet
- revisionslogg och tenant-säkra relationer

## Statusflöde

1. Ny
2. Planerad
3. Tilldelad
4. Pågår
5. Väntar material eller boende
6. Besiktning
7. Slutförd
8. Fakturerad
9. Stängd

Avbruten finns som separat avslutande status.

## Nästa leveranser

1. Tenant-säkert API för nummergenerering, SLA och statusövergångar.
2. Professionell detaljvy med tidslinje och tekniska kopplingar.
3. Planeringsvy, kalender och resursbeläggning.
4. Tid, material, körsträcka och kostnader.
5. Mobilteknikerflöde, signering och offline-förberedelse.
6. Fakturaunderlag, budgetavvikelse och rapportering.
