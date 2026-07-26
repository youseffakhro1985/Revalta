# Production hardening implementation – 2026-07

Branch: `cursor/production-hardening-impl-6157`

Stacks on tenant hardening (#159), dashboard shell (#160) and schema mirror (#162–#164).

## Implemented

1. **Integrations fail-closed**
   - Email/SMS no longer pretend success in production when unconfigured (`failed` instead of `mocked`).
   - Stripe checkout/portal returns `503` in production when not ready.
   - Register/invite no longer expose secret URLs in production.

2. **Document & file hardening**
   - Shared upload validation profiles with magic-byte checks.
   - Applied to ticket attachments, public attachments, work-order documents and operational documents.
   - Operational documents upload privately and expose controlled download URLs.
   - Document archive lists `downloadUrl` and serves files via `/api/documents/[id]/download`.

3. **Public portal hardening**
   - HMAC tracking tokens on create/track.
   - Public track/comment/upload accept token and scope by `company_id`.
   - Removed `company_id ?? undefined` audit filter risk on public track.

4. **Route consolidation**
   - Legacy `/dashboard/arbetsordrar/[id]/*` redirects to `/dashboard/arbetsorder/[id]`.
   - Index redirects to `/dashboard/arbetsorder`.
   - Operations overview retained as unique legacy surface.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run audit:prod
npm run build:ci
```
