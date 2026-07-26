# Revalta schema drift audit – 2026-07

Status: inventering och migrationsplan, inga schemaändringar.

## Bakgrund

Production Neon-databasen introspekterades med:

```bash
DATABASE_URL="..." DIRECT_URL="..." npx prisma db pull --print
```

Introspekterat schema sparades temporärt utanför repo och jämfördes med `prisma/schema.prisma`.

## Sammanfattning

Production-databasen innehåller 42 Prisma-modeller vid introspektion.

`prisma/schema.prisma` saknar 21 modeller som finns i databasen. Det innebär att delar av systemet kör mot tabeller via raw SQL eller äldre migrationsstruktur utan full Prisma Client-typning.

Detta är teknisk skuld med hög prioritet eftersom:

- nya utvecklare får inte full databasbild via `schema.prisma`,
- tenant- och relationer blir svårare att granska,
- Prisma Client saknar typer för produktionsobjekt,
- framtida migreringar kan bli riskabla om schemafilen inte är canonical.

## Saknade modeller i `schema.prisma`

Följande modeller finns i production men saknas i nuvarande Prisma-schema:

- `ComponentCostEntry`
- `ComponentLifecycleEvent`
- `LeaseContract`
- `MaintenanceAction`
- `MaintenancePlan`
- `MaterialCost`
- `PropertyEntrance`
- `PropertyInspection`
- `PropertyServiceAgreement`
- `PropertyTechnicalAsset`
- `PropertyWarranty`
- `Tenant`
- `TimeReport`
- `WorkOrderChecklistItem`
- `WorkOrderEditLock`
- `WorkOrderExecutionEntry`
- `WorkOrderInvoiceBasis`
- `WorkOrderNumberCounter`
- `WorkOrderReport`
- `WorkOrderSignature`
- `WorkOrderStatusEvent`

## Viktiga saknade fält/relationer

### WorkOrder

Production har flera enterprise-fält som saknas i schemafilen, bland annat:

- `work_order_number`
- `work_type`
- `source`
- `building_id`
- `technical_asset_id`
- `response_due_at`
- `completion_due_at`
- `sla_response_due_at`
- `sla_resolution_due_at`
- `responded_at`
- `paused_at`
- `pause_reason`
- `closed_at`
- `sla_status`
- `notes`
- `maintenance_cycle_key`
- `maintenance_cycle_advanced_at`

### OperationalDocument

Production har:

- `property_id`
- `technical_asset_id`
- relationer till `Property`
- relationer till `PropertyTechnicalAsset`

### Ticket

Production har:

- `tenant_id`
- relation till `Tenant`

Detta behöver särskilt utredas eftersom Revaltas primära tenant-begrepp annars är `company_id`.

## Prisma-varningar vid introspektion

Prisma rapporterade check constraints som Prisma Client inte fullt stödjer, bland annat för:

- WorkOrder source/work_type
- WorkOrder checklist items
- WorkOrder reports/signatures
- MaintenancePlan
- MaintenanceAction
- PropertyTechnicalAsset
- Lease/LeaseHolder
- OperationalDocument parent constraints

Detta betyder att DB:n har skydd som inte syns fullt ut i Prisma Client.

## Risker

### P0-risker

1. `schema.prisma` är inte fullständig källa för production DB.
2. Raw SQL kan bli nödvändigt där Prisma saknar modell.
3. Tenantrelationer på saknade tabeller är svåra att granska.
4. Nya migrationer kan missa befintliga constraints.
5. `Tenant`-modellen behöver utredas innan tenantbegrepp standardiseras.

### P1-risker

1. Relationer mellan arbetsorder, tekniska assets, dokument och underhåll är delvis osynliga i schemafilen.
2. Tester kan missa driftfel eftersom Prisma Client-typerna inte visar hela DB:n.
3. CI validerar nuvarande schema, men inte att schemafilen motsvarar production DB.

## Rekommenderad arbetsordning

### PR 1: Schema mirror utan beteendeändring

Mål:

- Lägg till saknade modeller och fält i `schema.prisma`.
- Ändra inte befintliga tabeller i migration.
- Skapa ingen destruktiv migration.
- Generera Prisma Client och säkerställ att build/test passerar.

Viktigt:

- Detta ska göras som schema-synk, inte produktändring.
- Inga tabeller ska droppas.
- Inga fält ska byta namn.
- Inga gamla migrationer ska ändras.

### PR 2: Tenantrelationer och indexrapport

Mål:

- Granska `Tenant` kontra `Company`.
- Dokumentera om `tenant_id` ska behållas, mappas eller avvecklas.
- Föreslå index på verkliga query patterns.

### PR 3: Raw SQL-reducering

Mål:

- Byt raw SQL till Prisma Client där modell nu finns.
- Behåll raw SQL där det ger tydlig teknisk nytta.
- Lägg tester runt ändrade queries.

## Testplan för schema-synk

Kör minst:

```bash
npm run db:validate
npm run lint
npm run test:ci
npm run typecheck
npm run audit:prod
npm run build:ci
```

Dessutom:

```bash
npx prisma generate
npx prisma migrate status
```

Mot en staging/ren DB:

```bash
npx prisma migrate deploy
```

## Rollbackplan

Eftersom första PR endast ska spegla befintlig DB i `schema.prisma`:

1. Om Prisma Client-generation eller build faller:
   - revert PR.
2. Om runtime beter sig annorlunda:
   - revert PR.
3. Ingen production DB-rollback ska krävas eftersom DB inte ändras.

## Slutsats

Schema drift är nästa stora konsolideringsområde efter tenantfilter. Första implementationen ska vara en strikt schema-spegling utan beteendeändring eller destruktiva migrationer.
