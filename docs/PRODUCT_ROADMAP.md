# Revalta – produkt- och leveransplan

Detta dokument styr fortsatt utveckling av Revalta som ett svenskt premiumsystem för fastighetsförvaltning. Varje område ska levereras i små, testbara pull requests. Designen ska fortsätta vara ljus, återhållsam, professionell och konsekvent med nuvarande petroleum-, sand- och ink-palett.

## Leverans 1 – operativ grund

- Operativ dashboard med akuta, försenade och otilldelade ärenden.
- Beståndsöversikt och tydliga genvägar.
- Fastighetsdetaljsida med grunddata och senaste ärenden.
- Stabil tenant-isolering i samtliga nya databasfrågor.

## Leverans 2 – komplett fastighetsregister

- Utökad fastighetsdata: fastighetsbeteckning, byggår, typ, BOA, LOA, antal lägenheter och lokaler.
- Byggnader, entréer, våningsplan, lägenheter, lokaler, förråd och tekniska utrymmen.
- Redigering, arkivering, sökning, filter och export.
- Omslagsbild, kontaktpersoner och ansvariga förvaltare.

## Leverans 3 – arbetsorder och felanmälan

- Tydligt statusflöde från nytt till avslutat.
- Kanban-, tabell- och kalenderläge.
- SLA, deadline, tilldelning, interna kommentarer och boendekommunikation.
- Tid, material, kostnad, leverantör och före-/efterbilder.
- Återkommande arbetsorder, checklistor, PDF-export och återöppning.

## Leverans 4 – team och behörigheter

- Roller för systemägare, administratör, förvaltare, fastighetsskötare, styrelse, leverantör och boende.
- Behörighet per företag, fastighet, dokumenttyp och funktion.
- Inbjudningar, avaktivering, sessionskontroll och fullständig händelselogg.

## Leverans 5 – dokument och digital fastighetspärm

- Dokumentmappar, kategorier, taggar och förhandsvisning.
- Versionshistorik, giltighetsdatum och automatiska påminnelser.
- Koppling till fastighet, byggnad, ärende, avtal och leverantör.
- Säker filuppladdning med behörighet och spårbarhet.

## Leverans 6 – ronder och tillsyn

- Återkommande ronder och anpassade checklistor.
- QR-koder, bilder, avvikelser, signering och ansvarig.
- Automatisk arbetsorder från avvikelse.
- Missade ronder och historik per fastighet.

## Leverans 7 – underhållsplan

- Byggnadsdelar, intervall, nästa åtgärd, prioritet och kostnad.
- 10-, 20-, 30- och 50-årsvy.
- Kostnad per år och kvadratmeter samt underhållsskuld.
- Koppling till offert, arbetsorder, dokument och genomförd åtgärd.

## Leverans 8 – leverantörer, avtal och kostnader

- Leverantörsregister, kontaktpersoner, kategorier och certifikat.
- Avtalstid, uppsägning, förlängning, index och påminnelser.
- Material, arbetstid, externa kostnader och budget mot utfall.
- Offertförfrågan och jämförelse av offerter.

## Leverans 9 – boendeportal

- Säker boendeinloggning och fortsatt stöd för publik felanmälan.
- Status, meddelanden, bilder, besökstid och huvudnyckelmedgivande.
- Dokument, nyheter, kontaktuppgifter och bokningar.
- E-post-, SMS- och pushnotiser.

## Leverans 10 – planering och kommunikation

- Gemensam kalender för arbetsorder, ronder, besiktningar, avtal och underhåll.
- Notiscenter, olästa händelser, påminnelser och massutskick.
- Personliga arbetsvyer och ansvarsfördelning.

## Leverans 11 – integrationer och ekonomi

- Produktionsklar e-post och fillagring.
- Fortnox/Visma-export och senare API-integration.
- BankID-utredning och säker autentiseringsstrategi.
- Import/export, webhooks och robust integrationslogg.

## Leverans 12 – mobil och AI

- Installerbar PWA för boende och fältpersonal.
- React Native/Expo-app när kärnflödena är stabila.
- AI-stöd för kategorisering, prioritering, sammanfattning och dokumentanalys.
- AI ska alltid visa underlag, konfidens och kräva mänskligt beslut vid kritiska åtgärder.

## Kvalitetskrav för varje leverans

- Svensk premiumdesign och konsekventa komponenter.
- Mobilanpassning och tillgänglighet.
- Tenant-isolering, rollkontroll och audit log.
- Validering, tydliga felmeddelanden och tomlägen.
- Prisma-migration när datamodellen ändras.
- Lint, build och relevanta tester innan merge.
- Ingen direkt ändring av `main`; allt går via separat branch och pull request.
