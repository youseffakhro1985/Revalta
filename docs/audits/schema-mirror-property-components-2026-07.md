# Schema mirror – Property components & OperationalDocument (2026-07)

Status: schema-synk utan beteendeändring och utan ny migration.

Bygger vidare på WorkOrder-speglingen (`schema-mirror-work-order-2026-07.md`).

## Scope

1. `OperationalDocument`: `property_id`, `technical_asset_id` + relationer/index
2. Property card / component-modeller:
   - `PropertyEntrance`
   - `PropertyTechnicalAsset`
   - `PropertyWarranty`
   - `PropertyInspection`
   - `PropertyServiceAgreement`
3. Lifecycle/cost:
   - `ComponentLifecycleEvent`
   - `ComponentCostEntry`
4. Underhållsplan:
   - `MaintenancePlan`
   - `MaintenanceAction`
5. Kopplar `WorkOrder.technical_asset_id` till `PropertyTechnicalAsset`

## Medvetna avvikelser

- Relationsnamn hålls camelCase och konsekventa med övriga schema (`technical_asset`, `created_by`, …), inte introspektionens DB-nära namn.
- Partial unique indexes på `sync_key` finns i DB men uttrycks inte som `@@unique` i Prisma.
- `LeaseContract` / `Tenant` / `MaterialCost` / `TimeReport` lämnas till senare PR.

## Vad som inte ändras

- Ingen ny migration
- Inga destruktiva DB-ändringar
- Inga call-site-migreringar från raw SQL till Prisma Client
