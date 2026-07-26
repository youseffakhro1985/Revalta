# Schema mirror – Lease/tenant & legacy cost tables (2026-07)

Status: schema-synk utan beteendeändring och utan ny migration.

Bygger vidare på WorkOrder- och property-component-speglingarna.

## Scope

1. `Tenant` (legacy boende-auth)
2. `LeaseContract` (legacy hyreskontrakt)
3. `Ticket.tenant_id` + relation till `Tenant`
4. `MaterialCost`
5. `TimeReport`

## Tenant vs Company

| Begrepp | Modell | Betydelse |
| --- | --- | --- |
| B2B-tenant | `Company` | Primär multi-tenant-nyckel i Revalta SaaS |
| Legacy boende | `Tenant` | Äldre portal-/boendeanvändare i production DB |
| Canonical leasing | `Lease` / `LeaseHolder` | Aktiv uthyrningsmodell i applikationen |

`Ticket.tenant_id` speglas eftersom kolumnen finns i production, men ny kod ska fortsätta isolera data via `company_id`.

## Legacy cost tables

- `MaterialCost` och `TimeReport` är dead/legacy i production (saknas i moderna Prisma-call sites).
- Canonical billable path: `WorkOrderTimeEntry` / `WorkOrderMaterialEntry` / `WorkOrderInvoiceDraft` (attesterbar ekonomi → fakturaunderlag).
- Field ops förblir `WorkOrderExecutionEntry` (`material` / `time`) för utförande i fält.
- Speglas för typning och inventering, inte för ny featureutveckling.

## Vad som inte ändras

- Ingen ny migration
- Inga destruktiva DB-ändringar
- Inga call-site-migreringar
- Ingen avveckling av `Tenant` i denna PR

## Schema-mirror-serie

Efter denna PR är de 21 tidigare saknade modellerna från drift-audit speglade i `schema.prisma` (WorkOrder-satelliter, property/components, lease/cost).
