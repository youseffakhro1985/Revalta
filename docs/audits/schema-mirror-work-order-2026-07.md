# Schema mirror – WorkOrder enterprise (2026-07)

Status: schema-synk utan beteendeändring och utan ny migration.

## Scope

Första incremental PR enligt `schema-drift-2026-07.md`:

1. Enterprise-fält på `WorkOrder`
2. Satellitmodeller:
   - `WorkOrderChecklistItem`
   - `WorkOrderEditLock`
   - `WorkOrderExecutionEntry`
   - `WorkOrderInvoiceBasis`
   - `WorkOrderNumberCounter`
   - `WorkOrderReport`
   - `WorkOrderSignature`
   - `WorkOrderStatusEvent`

## Medvetna avvikelser från full introspektion

- Befintliga relationsnamn och `onDelete`-beteenden på redan speglade modeller bevaras.
- `ticket_id` förblir optional (`String?`) eftersom applikationen skapar arbetsorder utan ticket.
- `technical_asset_id` speglas som skalärfältt utan Prisma-relation tills `PropertyTechnicalAsset` speglas i nästa PR.
- Partial unique indexes (t.ex. company + work_order_number) finns i DB via migrationer men uttrycks inte som `@@unique` i Prisma (saknar partial-stöd).
- `MaterialCost` och `TimeReport` lämnas till senare spegling.

## Vad som inte ändras

- Ingen ny migration
- Inga destruktiva DB-ändringar
- Inga call-site-migreringar från raw SQL till Prisma Client i denna PR

## Verifiering

```bash
DATABASE_URL=... DIRECT_URL=... npx prisma validate
npx prisma generate
npm run lint
npm run typecheck
npm run test:ci
npm run audit:prod
npm run build:ci
```
