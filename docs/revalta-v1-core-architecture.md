# Revalta 1.0 – kärnarkitektur och migreringsplan

## Mål

Revalta ska gå från en fungerande SaaS-prototyp med många separata moduler till ett sammanhängande fastighetssystem där data, behörigheter, historik och arbetsflöden hänger ihop tekniskt.

## Viktig nulägesobservation

Kärnmodellerna för företag, användare, fastigheter, byggnader, enheter och ärenden finns i Prisma. Flera senare moduler använder däremot AuditLog som primär lagring. AuditLog ska endast användas för revisionshistorik, inte som huvuddatabas för affärsobjekt.

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

## Kommande leveranser

### Leverans A – Ärende till arbetsorder

- Skapa arbetsorder från ärende.
- Koppla ansvarig, fastighet och enhet.
- Statushistorik.
- Kostnadsuppföljning.
- Stäng ärende när arbetsorder slutförs, valbart.

### Leverans B – Arbetsorder till projekt

- Skapa projekt från större arbetsorder.
- Budget, prognos och utfall.
- Entreprenör och projektledare.
- Dokument och projektkostnader.

### Leverans C – Besiktning och rond till åtgärd

- Avvikelse skapar ärende eller arbetsorder.
- Spårbar relation till ursprungskontrollen.

### Leverans D – IMD till debiteringsunderlag

- Avläsning skapar förbrukning.
- Förbrukning skapar debiteringsrad.
- Debiteringsrad kan kopplas till hyresavi.

### Leverans E – Ekonomi och rapportering

- Projekt och arbetsordrar påverkar budgetutfall.
- Rapporter hämtar från normaliserade tabeller.
- Export till CSV, Excel och PDF.

## Kvalitetskrav före merge

- Prisma validate och generate ska lyckas.
- ESLint ska vara grön.
- Next.js production build ska vara grön.
- Tenant-isolering ska verifieras.
- Behörighetskontroller ska verifieras.
- Inga produktionsdata får raderas av migrationen.
- Vercel-deploy ska vara grön innan publicering.
