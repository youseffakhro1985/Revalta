# Revalta — full teknisk plattformsrevision

Datum: 2026-09-01  
Produktions-URL: `https://www.revalta.se`  
Verifierad `main` och Production SHA: `48be6cbe10eac06710bdb8ce049e8c2c18e7d68e`  
Revisionstyp: källkod, GitHub, tillgänglig Vercel-scope, publik runtime och autentiserad read-only produktionsverifiering

## Andra genomförandeuppföljningen — 2026-09-01 16:28 UTC

Aktuell verifierad `main` och Production SHA är `37d7321e84a2a9fc2d0d2fe212e6cbf5503acd7d`. Production kör deployment `dpl_Yrfsn4JtCNLj75xoBZb5oG1JLhh3` och rapporterar `status=ok`, `database=ok`, `schema.ready=true`, `modernStorageOnly=true`, komplett kritisk miljönärvaro och 12 ms health-latens vid slutkontrollen.

Två ytterligare releaser har passerat exact-SHA Vercel Preview, Revalta CI, CodeQL och Preview Browser E2E samt verifierats i Production:

| Leverans | Resultat |
| --- | --- |
| PR #369 | Samtliga sju produktions-cronroutes har korrelations-ID, strukturerad loggning, privata no-store-svar och säkra toppnivåfel. Råa interna fel lagras inte längre i preventive-/incidenthistorik, service-assignment-escalation har durable `CronJobRun`, fakturaexport lagrar inte leverantörsbody eller oväntade DB-detaljer och rå `console.error` är borttagen utanför den centrala loggtransporten. |
| PR #369 / issue #265 | Password reset returnerar det neutrala anti-enumerationssvaret före rate limit, lookup, token och e-post via Next.js `after()`. Kall exact-SHA Preview passerade på 1 248 ms. |
| PR #370 | Både submit och kontrollerat e-postfält skyddas fram till hydration så en omedelbar kall sidinteraktion varken kan tappa POST eller få ifyllt värde återställt. Ny kall Preview passerade på 692 ms och slutlig kall Production-kontroll på 4 092 ms. |

Senaste fulla lokala kvalitetsgrind: **181/181 testfiler, 1 111/1 111 tester, 0 produktionssårbarheter och 131 statiska sidor i Next.js 16.3-produktionsbuilden**. Exakt kandidat-SHA passerade dessutom ren databas/migration, CI-build, CodeQL och full auth/navigation/mobile/Command Center-E2E.

Den evidensbaserade arbetsbedömningen höjs försiktigt till cirka **89 % tekniskt genomförande**, **65 % säker kommersiell lanseringsberedskap** och **78 % sammanvägd status**. Förbättringen gäller runtime-felhantering, cronspårbarhet och återställningsflödets determinism; de externa P0-blockerarna nedan är fortfarande oförändrade.

Cron-reliability är nu kodmässigt starkare genom auth, kandidat-/jobbidempotens, advisory-/atomic claims, processing leases där externa side effects förekommer, partiell felisolering, batchinggränser, svensk datumkontext, korrelerad loggning och durable run/resultat för de kritiska jobben. P1-punkten kan dock inte markeras helt klar förrän alla sju jobb har körts med Production-`CRON_SECRET`, deras run-/alert-/reconciliationutfall har lästs i drift och Vercel-loggar/cronhistorik är åtkomliga för revision.

## Uppföljning efter genomförande — 2026-09-01 15:28 UTC

Den ursprungliga revisionsbaslinjen nedan bevaras för spårbarhet. Efter revisionen har fyra isolerade releaser passerat lokal full quality, exact-SHA Vercel Preview, Revalta CI, CodeQL och Preview Browser E2E, mergats via pull request och verifierats i Production.

Aktuell verifierad `main` och Production SHA är `20fcce104d7224f8f5775be19312da2b984fc202`. Production health rapporterar `status=ok`, `database=ok`, `schema.ready=true`, `modernStorageOnly=true` och deployment `dpl_EfcwuZeDaaSt8BvnG9cLqZG1DfNe`.

| Leverans | Resultat |
| --- | --- |
| PR #365 | Truthful integrationsstatus, neutral juridisk footer, borttagen inert länk, skärpt UI-audit och H1 i underhållsportföljens alla tillstånd. |
| PR #366 | H1 för överlämning/besiktning och sann loading-state i integrationsmått. |
| PR #360 | Ärendetilldelning och delete-affordance följer API:ts capability-kontrakt; tekniker skickar inte förbjuden assignee-mutation. |
| PR #367 / issue #361 | Terminalt arbetsorderutförande låst, legacy SLA-mutation avvecklad, kanonisk och transaktionell completion med status-event samt ticket-/komponentsynk, och roll-/finanskorrekt read-only UI. |

Senaste fulla lokala kvalitetsgrind: **177/177 testfiler, 1 092/1 092 tester, 0 produktionssårbarheter och 131 statiska sidor i Next.js-produktionsbuilden**. Det är 31 fler regressionstester än revisionsbaslinjen.

Den uppdaterade evidensbaserade arbetsbedömningen är cirka **87 % tekniskt genomförande**, **64 % säker kommersiell lanseringsberedskap** och **76 % sammanvägd status**. Förbättringen kommer främst från stängda behörighets- och arbetsorderlivscykelrisker; data/release operations, juridik och ägarbeslut är oförändrade blockerare.

### P0 som nu är slutfört

- Vercels deploymentkvot återhämtade sig; exact-SHA previews kunde byggas igen.
- PR #360 är mergead och exakt Production-verifierad.
- Issue #361 är implementerad, regressionstestad, mergead och exakt Production-verifierad.
- Golden-pathens execution-finalisering har nu en gemensam completion-sanning för status, statushistorik, ticket, komponent och ekonomiskt fältutfall.
- Viewer och terminala arbetsorderlägen visar inte längre mutationskontroller som servern ska avvisa; teknikers redakterade kostnader renderas inte som falskt `0 kr`.

### P0 som fortfarande kräver extern åtkomst eller ägarbeslut

1. Kör read-only `Database Status` på exakt `20fcce104d7224f8f5775be19312da2b984fc202` och bevisa aktuell restore point. Tillgänglig GitHub-anslutning kan läsa workflows men inte dispatcha dem.
2. Ge Vercel-anslutningen åtkomst till projektet `revalta`; teamet syns men projektlistan är fortfarande tom, så runtime-loggar, cronhistorik, rollback och usage kan inte granskas via API:t.
3. Aktivera branchskydd/ruleset för `main` med PR, Revalta CI, CodeQL, Vercel och Preview Browser E2E som obligatoriska gates. Tillgänglig GitHub-anslutning saknar settings-/ruleset-mutation.
4. Bekräfta portalägaren. Publik Production-portal är explicit kopplad till tenant `yousef AB` och visar en aktiv fastighet; det autentiserade arbetsutrymmet är den separata tenantorganisationen `Bovalta`. Koden gissar inte mellan dem och tenant-ID får inte bytas utan beslut.
5. Fastställ juridisk identitet, organisationsnummer, kontaktväg, personuppgiftsansvarig, underbiträden, lagringstider, DPA och slutliga villkor/integritetstexter.
6. Besluta om det publika GitHub-repot ska vara avsiktligt open source eller privat/proprietärt och välj licens-/IP-strategi.

## Sammanfattning

Revalta är inte en prototyp. Det är en stor, sammanhängande Next.js-applikation med verklig produktionsdata, bred domänmodell, autentisering, tenant-kontext, premium-UI, driftstatus, faktiska arbetsflöden och en ovanligt omfattande lokal kvalitetsgrind.

Plattformens tekniska genomförande bedöms till cirka **82 %**, medan säker kommersiell lanseringsberedskap bedöms till cirka **58 %**. Sammanvägd status är **71 %**. Skillnaden beror främst på release- och verksamhetsblockerare, inte på avsaknad av sidor:

- Production migration status och återställningsbar backup är inte separat verifierade.
- `main` saknar tekniskt branchskydd.
- Vercel-anslutningen ser teamet men inte projektet, loggarna eller konfigurationen.
- Preview för öppna PR #360 är blockerad av Hobby-planens deploymentgräns.
- Full tenant- och relaterad-objektgranskning är ännu inte avslutad.
- Arbetsorderns terminala livscykelgränser återstår i issue #361.
- Juridiska texter är uttryckligen utkast och juridisk identitet behöver bekräftas.
- Publik boendeportal verkar vara kopplad till en annan eller tom organisation än den autentiserade produktionsorganisationen.
- Repo är publikt, saknar branchskydd och kräver ett uttryckligt IP-/licensbeslut.

## Poängmodell

| Område | Poäng | Vikt | Bedömning |
| --- | ---: | ---: | --- |
| Implementationsbredd | 82/100 | 20 % | Mycket bred produkt, men readiness-bevis saknas per modul. |
| Automatisk kodkvalitet | 94/100 | 15 % | Full quality grön, 1 061 tester och 0 prod-sårbarheter. |
| Runtime och tillgänglighet | 88/100 | 10 % | Health, auth och 53 dashboard-rutter verifierade i Production. |
| Säkerhet och tenant | 72/100 | 20 % | Bra grundskydd, men #360 och full tenant-matris återstår. |
| Data och release operations | 58/100 | 15 % | Databasen svarar och soft-delete-schema är redo; full migration/restore saknar bevis. |
| Externa integrationer | 52/100 | 10 % | Fem nyckelgrupper finns, men provider-E2E och ekonomisystem återstår. |
| Juridik och kommersiell drift | 35/100 | 10 % | Juridiska utkast, Hobby-gräns, publik repo och oklara bolagsuppgifter. |
| **Sammanvägt** | **71/100** | **100 %** | Stark teknisk beta; inte ännu riskfri kommersiell GA. |

Poängen är en evidensbaserad arbetsbedömning och inte ett påstående om att en viss procent av varje fil är färdig.

## Verifierad teknisk omfattning

| Mått | Verifierat värde |
| --- | ---: |
| Next.js | 16.3 i verifierad build |
| React | 19.2 |
| Prisma-modeller | 84 |
| Prisma-migrationer | 49 |
| API route handlers | 156 |
| Dashboard-sidor | 53 kanoniska statiska rutter runtime-verifierade |
| Totala `page.tsx` | 82 |
| TSX-filer i UI-audit | 170 |
| Källkod | cirka 97 000 rader |
| Tester | 1 061 godkända i 173 testfiler |
| Produktionssårbarheter | 0 enligt `npm audit --omit=dev` |
| Buildresultat | 131 statiska sidor, full build godkänd |

## Production — verifierad runtime

### Publik yta

- Startsidan laddar med korrekt svensk titel, H1, canonical, Open Graph, Twitter metadata och JSON-LD.
- Login, registrering, lösenordsåterställning, portal och juridiksidor renderar.
- Dashboard utan session redirectar till login.
- Skyddade API:er utan session svarar strukturerat `401` med request-ID.
- Lösenordsåterställning för okänd adress svarar neutralt och läcker inte kontostatus.
- Säkerhetsheaders inkluderar CSP, HSTS, `X-Frame-Options: DENY`, COOP och `no-store` där det krävs.
- Inga Revalta-originerade konsolfel observerades. Webbläsartilläggsfel exkluderades.

### Autentiserad yta

- Inloggning som ägarroll fungerar i Production.
- Samtliga 53 kanoniska statiska dashboard-rutter laddades på avsedd URL utan applikationsfel.
- Dynamisk fastighetsvy, tre verkliga ärendedetaljer och verklig arbetsorder laddades.
- Produktionsorganisationen innehåller en aktiv fastighet, tre öppna ärenden och en arbetsorder.
- Ärendeflödet visar AI-analys, prioritet, bilaga, kommentarer, audit timeline och koppling till arbetsorder.
- Arbetsordern visar exklusivt redigeringslås, SLA, statusstyrning, checklista, tid, material, kostnad, attest, fakturaunderlag, export, signatur, rapport och dokument.
- Tomma tillstånd fungerar i projekt, underhållsplan och uthyrningsöverlämning.

### Driftvy

Den autentiserade driftvyn verifierar följande för Production:

- status `ok`
- databas `ok`
- exakt Production SHA
- `schema.ready = true` för soft-delete-kraven
- `modernStorageOnly = true`
- `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, e-post, Blob och `CRON_SECRET` finns
- Stripe, SMS och AI är konfigurerade på nyckelnivå
- sju cron-rutter är deklarerade

Viktig avgränsning: `schema.ready` kontrollerar de obligatoriska soft-delete-kolumnerna. Det ersätter inte `prisma migrate status` för alla 49 migrationer och bevisar inte backup/restore.

## Källkod och arkitektur

### Styrkor

- App Router används med ett kanoniskt dashboardträd och separata legacy-redirects.
- Server- och klientkomponenter är i huvudsak rimligt separerade.
- Sessionen verifieras serverside och `Company` används som B2B-tenant.
- Osäkra mutationer går genom origin-/request-skydd, med Stripe-webhook som avsiktligt undantag.
- Kritiska svar använder privata `no-store`-headers.
- Uploads validerar filtyp, storlek och lagringsåtkomst.
- Soft delete har kompatibilitetslager och fail-closed mutationer vid saknat schema.
- Audit logs, integrationshändelser, request-ID och strukturerad loggning finns.
- Produktionsbuild får inte exekvera databasrelease.
- Produktions-SHA övervakas mot GitHub main.
- Designen återanvänder petroleum/sand/ink tokens, gemensamma premiumkomponenter och Lucide.

### Skulder och risker

- 60 av 156 API-handlers saknar samlokaliserat `route.test.ts`; en del täcks indirekt, men detta är inte bevisat för alla.
- Högprioriterade testgap finns i audit, cron, arbetsorder execution, rondchecklistor, underhåll, ticket attachments/comments/timeline och flera relationstunga endpoints.
- `getCurrentUser()` gör verifiering och databasuppslag; vissa requests kan dessutom göra rolluppslag i proxy. Prestandapåverkan behöver mätas innan optimering.
- Feature Readiness klassar alla breda moduler som `PARTIAL`, utom Billing `BETA` och Ronder `BLOCKED` i den konservativa baslinjen.
- Det finns 84 modeller och en mycket bred UI-yta; mängden funktioner ökar kostnaden för full tenant-, lifecycle- och behörighetsbevisning.

## GitHub

### Verifierat

- Repo: `youseffakhro1985/Revalta`.
- `main` är samma SHA som Production.
- Senaste Revalta CI och CodeQL är gröna på exakt SHA.
- Production Uptime och Production Release Monitor är gröna.
- Repo är publikt.
- `main` har `protected=false` och inga rulesets.

### Öppna koordinationsobjekt

- PR #360: behörighetsgränser för ärendetilldelning och delete-kontroller. CI och CodeQL är gröna; exact-SHA Vercel preview saknas på grund av `build-rate-limit`.
- Issue #361: terminala och invoicerade arbetsordrar kan fortfarande ha ofullständiga serverside-livscykelgränser. Arbetet ska börja först efter #360 är mergead och verifierad.
- Issue #265: lösenordsreset-stall verkar kodmässigt åtgärdad med bounded arbete och `after()`, men issue är inte runtime-stängd.
- Issue #217: observability phase 2 ska återimplementeras från färsk main.
- Äldre PR #312, #311, #310, #309, #308, #254, #239 och #218 ska behandlas som karantän, inte mergeas direkt.

## Vercel

### Verifierat indirekt

- GitHub-deploymentstatus och Production health bevisar att Vercel bygger och kör exact main SHA.
- Production deployment-ID exponeras av health.
- PR #360 har stoppats av Vercels Hobby-gräns för fler än 100 deployments per dag.

### Blockerat

Den anslutna Vercel-scope:n visar teamet och Hobby-planen men returnerar inga projekt. Därför gick det inte att verifiera genom Vercel-API:t:

- projekt-ID och faktisk teamkoppling
- Git production branch och deploy-inställningar
- runtime-/buildloggar
- env-närvaro direkt i Vercel
- cron-exekveringshistorik
- användning, gränser och kostnadsnivå
- rollback/deployment protection

Inga värden har gissats.

## Databas och migration

### Verifierat

- Production-databasen svarar.
- Modern-only storage är aktiv.
- Soft-delete readiness är grön.
- Samtliga 49 migrationer går att applicera mot ren PostgreSQL i CI.
- `DIRECT_URL` och `DATABASE_URL` finns i Production enligt driftvyn.

### Inte verifierat

- `prisma migrate status` för exakt Production-databas och exakt current-main SHA.
- Om `20260822010000_inspection_checklist_templates` finns i Production.
- Att den tidigare observerade Neon-instansen säkert är samma databas som Vercel Production.
- En verifierad återställningspunkt och praktiskt restore-förfarande.

### Säker ordning

1. Kör den read-only GitHub Action som heter `Database Status` med exakt current-main SHA.
2. Spara resultatet utan mutation.
3. Verifiera backup/branch/restore point.
4. Endast om migration saknas: kör skyddad `Database Release` med samma SHA och bekräftelsen `MIGRATE_PRODUCTION`.
5. Kör status igen och smoke-testa rond/checklistor samt cross-tenant access.

## Produktens golden path

Följande delar finns i UI och dataflöde:

`Ärende → AI/prioritet → SLA → ansvarig → arbetsorder → lås/status → checklista → tid/material/kostnad → dokument → signatur → rapport → fakturaunderlag → export`

Det som återstår för att kalla flödet fullt produktionshärdat:

- #360 behörighetsgränser mergeade och runtime-verifierade.
- #361 terminal/invoiced/cancelled/completed-regler i canonical workflow.
- Finalisering måste synka ticket, komponentstatus, statushistorik och finance utan parallell sanning.
- Viewer/technician/vendor-kontroller måste följa endpoint-permission, inte bara UI-synlighet.
- Full browserautomation på exact SHA inklusive negativ cross-tenant-matris.
- Boendeåterkoppling efter avslut måste verifieras som samma canonical flöde.

## Integrationer

### Nuvarande status

- Nyckelnivå: e-post, SMS, Stripe, Blob och AI är konfigurerade.
- Fortnox, Visma och generell fakturawebhook saknar konfiguration.
- Fakturaexportkön är tom i verifierad Production.
- Minst en verklig integrationshändelse är slutförd, men det finns historiska misslyckade e-posthändelser.
- Historiska AI-/Stripe-poster visas som `queued` trots att de egentligen är telemetri efter genomfört arbete.

### Implementerad korrigering i denna branch

- Ny slutförd AI-, Blob- och live Stripe-telemetri registreras som `completed` i stället för falskt `queued`.
- Produktionsmock/okonfigurerad Stripe registreras `failed`; utvecklingsmock kan fortsatt registreras `mocked`.
- Integrationsvyn visar svenska statusetiketter och räknar `sent`/`completed` som slutfört.
- Historiska rader muteras inte utan separat beslutad datamigrering.

## Portal, juridik och kommersiell sanning

### Portal

Den publika portalen renderar, men dess fastighetslista är tom samtidigt som den autentiserade organisationen har en aktiv fastighet. Koden har en versionsstyrd fallback för `PUBLIC_PORTAL_COMPANY_ID`. Rätt Production-tenant måste verifieras och sättas i Vercel; tenant-ID ska inte gissas eller ändras via en orelaterad kodrelease.

### Juridik

- Integritet, villkor och GDPR är märkta som utkast.
- Exakt personuppgiftsansvarig, organisationsnummer, kontaktväg, underbiträden och lagringstider saknas eller behöver bekräftas.
- DPA och registrerades self-service är inte fullständiga.
- Footer på Production påstår `Revalta AB` utan verifierad legal identitet i repo eller ansluten konfiguration.

I denna branch har footern ändrats till neutrala `Revalta` tills korrekt juridisk identitet är beslutad. Juridiska texter får inte fyllas med påhittade bolagsuppgifter.

### IP och repo

Repo är publikt och saknar registrerat licensbeslut. Ägaren måste välja mellan avsiktlig open source/public och proprietary/private. En privatflytt ska föregås av kontroll av Vercel Git integration, Actions, CodeQL, environments, collaborators och deploy-access.

## Implementerat i revisionsbranchen

Branch: `codex/audit-ui-readiness-20260901`

1. Tog bort inert `href="#"` i överlämningsrapporten.
2. Renderar korrekt disabled knapp när inget avtal finns och riktig Next `Link` först när route-parametern finns.
3. Säkrade att underhållsportföljens loading-, error- och empty-state alltid har unik H1 för route announcement och tillgänglighet.
4. Neutraliserade det obekräftade juridiska suffixet `AB` i publika footern.
5. Skärpte den statiska UI-auditen så ogiltiga länkar även hittas inuti villkorsuttryck.
6. Korrigerade integrationsstatus för genomförd AI-, lagrings- och Stripe-telemetri.
7. Lade till regressionstester för ny integrationsstatus.

## Prioriterad återstående backlog

### P0 — stoppar säker GA

1. Återställ Vercel-projektåtkomst och lös Hobby deploymentgräns.
2. Kör exact-SHA preview för PR #360, mergea först när alla checks är gröna och verifiera Production.
3. Implementera issue #361 från den då aktuella main-SHA:n.
4. Kör read-only Database Status och verifiera restore point före eventuell Database Release.
5. Aktivera branchskydd/ruleset för `main`.
6. Verifiera `PUBLIC_PORTAL_COMPANY_ID` mot rätt produktionsorganisation.
7. Besluta juridisk identitet och färdigställ integritet, villkor, GDPR/DPA och kontaktuppgifter.
8. Besluta repo visibility och licens/IP-strategi.

### P1 — krävs för READY-moduler

1. Full endpoint-/modellmatris för tenant, relationer, export och Blob.
2. Cross-company negativa tester för prioriterade 60 route-handlers utan samlokaliserade tester.
3. Exact-SHA golden-path E2E för ärende till boendeåterkoppling.
4. Billing plan registry och full Stripe webhook/idempotency/replay-livscykel.
5. Provider-E2E för e-post, SMS, Stripe, AI och Blob utan att exponera secrets.
6. Cron-reliability: auth, idempotency, lås, retry, partial failure, batching och tidszon.
7. Query-/prestandarevision med faktisk Vercel/DB-telemetri före optimering.
8. Observability phase 2 från färsk main.
9. Modulvis mobile/a11y/error/retry/browser-evidens enligt `FEATURE_READINESS.md`.

### P2 — produktförfining

1. Färdig onboarding: teaminbjudan och notisinställningar.
2. Sanera historisk integrationsstatus med explicit, reversibel datamigrering om affärsvärdet motiverar det.
3. Skapa realistiska QA-fixtures för avtal, projekt, underhåll, komponenter och leverantörer.
4. Stäng eller ersätt historiska PR/issue-spår så backlog endast beskriver aktuell main.
5. Förbättra kundnära copy där “konfigurerad” bara betyder att en nyckel finns, inte att provider-E2E är verifierat.

## Slutkriterium för 100 %

Revalta kan kallas fullt produktionsredo först när:

- alla P0-punkter ovan är verifierade med current-main/exact-SHA-evidens,
- golden path är server-side lifecycle-härdad och browsertestad,
- tenant-matrisen är grön med negativa cross-company-tester,
- migration och restore är operativt bevisade,
- Vercel/loggar/cron/usage går att läsa och övervaka,
- juridisk identitet och avtalstexter är fastställda,
- minst de kommersiellt exponerade huvudmodulerna kan flyttas från `PARTIAL` till `READY` enligt den dokumenterade evidence-gaten.
