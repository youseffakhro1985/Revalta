# Revalta 1.0 – kärnarkitektur och migreringsplan

## Mål

Revalta ska gå från en fungerande SaaS-prototyp med många separata moduler till ett sammanhängande fastighetssystem där data, behörigheter, historik och arbetsflöden hänger ihop tekniskt.

## Viktig nulägesobservation

Kärnmodellerna för företag, användare, fastigheter, byggnader, enheter och ärenden finns i Prisma. Affärsobjekt skrivs till normaliserade tabeller; AuditLog är revisionshistorik. Äldre AuditLog-/IntegrationEvent-rader kan fortfarande dual-läsas tills backfill är verifierad i produktion, men nya mutationer fail-closar mot moderna tabeller.

## Prioriterad vertikal leverans

Första riktiga arbetsflödet byggs som:

1. Ärende
2. Arbetsorder
3. Projekt
4. Budgetpåverkan
5. Dokument och historik

Detta blir referensarkitekturen för övriga moduler.

## Nya kärnmodeller

### WorkOrder

- id
- company_id
- property_id
- unit_id
- source_ticket_id
- title
- description
- status
- priority
- assigned_to_id
- supplier_id
- planned_start
- planned_end
- completed_at
- estimated_cost
- actual_cost
- created_by_id
- created_at
- updated_at
- deleted_at

### Project

- id
- company_id
- property_id
- source_work_order_id
- name
- description
- status
- risk
- project_manager_id
- contractor_id
- start_date
- end_date
- budget
- forecast
- actual
- created_by_id
- created_at
- updated_at
- deleted_at

### ProjectCostEntry

- id
- project_id
- category
- description
- amount
- occurred_at
- created_by_id
- created_at

### EntityDocument

- id
- company_id
- entity_type
- entity_id
- file_name
- content_type
- size_bytes
- storage_url
- version
- uploaded_by_id
- created_at
- deleted_at

### EntityEvent

- id
- company_id
- entity_type
- entity_id
- event_type
- actor_user_id
- metadata
- created_at

## Databasprinciper

- Alla affärsobjekt måste ha company_id för strikt tenant-avgränsning.
- Alla vanliga listfrågor ska ha relevanta index.
- Soft delete används på affärsobjekt som behöver kunna återställas.
- Foreign keys ska ha medvetna onDelete-regler.
- AuditLog ska spegla förändringar men aldrig vara primär lagring.
- Statusfält ska valideras i API-lagret och helst som Prisma-enums när migrationen är stabil.
- Alla pengar lagras som Decimal, inte Float.

## API-principer

- GET ska stödja pagination, filter, sortering och sökning.
- POST ska validera tenant, roll och relationer.
- PATCH ska stödja partiella uppdateringar och statusövergångar.
- DELETE ska normalt soft-deleta.
- Alla mutationer ska skriva revisionslogg.
- Fel ska returneras med konsekventa svenska felmeddelanden och korrekta HTTP-statuskoder.

## Behörighetsprinciper

- owner: full åtkomst
- admin: full operativ åtkomst, begränsad ägaradministration
- manager: fastigheter, ärenden, arbetsordrar, projekt och rapporter
- technician: tilldelade ärenden och arbetsordrar
- viewer: läsbehörighet
- resident: endast egna ärenden, dokument, avier och bokningar
- supplier: endast tilldelade arbetsordrar och relevanta dokument

## Migreringsstrategi utan databortfall

1. Lägg till nya tabeller och relationer.
2. Behåll befintliga AuditLog-baserade läsningar tillfälligt.
3. Backfilla historiska objekt från AuditLog till nya tabeller.
4. Byt API-läsningar till nya tabeller.
5. Dubbelkontrollera antal och totalsummor.
6. Stäng av AuditLog som primär lagring.
7. Behåll historiken som revisionsspår.

## Leveransstatus

### Leverans A–D – levererade

- **A** Ärende → arbetsorder (skapande, koppling, statushistorik, ticket-sync).
- **B** Arbetsorder → projekt (skapande från WO-detalj, projektledare, dokument).
- **C** Besiktning/rond → åtgärd (avvikelser till arbetsorder, compliance corrective WO).
- **D** IMD → debiteringsunderlag (`ImdDebitLine` + koppling till hyresavi).

### Leverans E – Ekonomi och rapportering (levererad, dual-read-retirement kvar)

- Attesterbar tid/material/lönsamhet/fakturaunderlag på arbetsorder.
- Fakturaexport-UI till Fortnox/Visma/webhook (`WorkOrderInvoiceExportJob` + integrationsöversikt).
- Kanonisk fakturaväg: godkänd tid/material → `WorkOrderInvoiceDraft` → export. Rapportflödet skapar samma draft och arkiverar `WorkOrderInvoiceBasis` som snapshot.
- Fältavslut (`completion.finalize`) sätter driftkostnad och promoverar tid/material till attesterbara rader.
- Ticket time/cost blockeras när arbetsorder finns; ticket operations kan soft-deletas.
- Soft-delete för tickets, work orders, projects, properties, leases, lease holders, operational documents, notifications; IMD void.
- Cron-produktjournaler på `CronJobRun` (preventive/recurring escalations).
- Efter prod-backfill: sätt `REVALTA_MODERN_STORAGE_ONLY=1` för att stänga dual-read via `mergeByCreatedAt` och WO-ops-storage (migreringssteg 6). Full borttagning av legacy-kodgrenar kan ske i en senare städ-PR.

## Kvalitetskrav före merge

- Prisma validate och generate ska lyckas.
- ESLint ska vara grön.
- Next.js production build ska vara grön.
- Tenant-isolering ska verifieras.
- Behörighetskontroller ska verifieras.
- Inga produktionsdata får raderas av migrationen.
- Vercel-deploy ska vara grön innan publicering.
