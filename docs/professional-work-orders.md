# Revalta – professionella arbetsordrar

Denna leverans gör arbetsordern till ett komplett operativt arbetsverktyg för förvaltare, tekniker och entreprenörer.

## Principer

- All data tillhör en organisation (`company_id`) och valideras mot aktiv användare.
- Arbetsordern är huvudobjektet; tid, material, kostnader, checklistor och foton är riktiga relationsposter.
- Alla ekonomiska belopp lagras exklusive moms med två decimaler.
- Alla viktiga ändringar skrivs till revisionsloggen.
- Migrationer är additiva och tar inte bort eller skriver över befintliga poster.
- Mobilflödet prioriteras för fastighetsskötare ute i fält.

## Datamodell

### WorkOrderChecklistItem

- arbetsorder
- organisation
- rubrik och instruktion
- ordningsföljd
- obligatorisk eller valfri
- status
- utförd av och utförd tid
- kommentar

### WorkOrderTimeEntry

- arbetsorder
- organisation
- användare
- minuter
- arbetstyp
- beskrivning
- arbetsdatum
- debiterbar eller intern

### WorkOrderCostEntry

- arbetsorder
- organisation
- registrerad av
- kostnadstyp: material, resa, entreprenör eller övrigt
- leverantör och beskrivning
- antal, enhet, styckpris och totalbelopp
- momsprocent som metadata
- underlagsdokument

### SLA på WorkOrder

- SLA-policy eller servicenivå
- svarstidens deadline
- åtgärdstidens deadline
- första svarstid
- SLA-status
- pausad tid vid väntan på boende eller material

## Första användarflödet

1. Förvaltaren öppnar en arbetsorder.
2. Systemet visar SLA, ansvarig, tidsplan och kostnadsram.
3. Teknikern startar arbetet och registrerar tid.
4. Checklistan genomförs punkt för punkt.
5. Material och resa registreras med belopp och underlag.
6. Före- och efterbilder laddas upp genom dokumentmodulen.
7. Arbetsordern slutförs först när obligatoriska kontrollpunkter är godkända.
8. Faktiskt utfall räknas från registrerad tid och kostnad.
9. Revisionshistoriken visar vem som gjort vad och när.

## Leveransordning

1. Datamodell och additiv migration.
2. Tenant-säkra API:er för checklista, tid och kostnad.
3. SLA-beräkning och validering.
4. Mobil arbetsyta i arbetsorderdetaljen.
5. Före/efter-bilder och dokumentkategorier.
6. Summering av tid, material, resa och total kostnad.
7. Slutförandekontroll, tester och premiumfinish.
