# Revalta – Premium SaaS för Fastighetsförvaltning

![Revalta Logo](https://img.shields.io/badge/Revalta-SaaS-0f172a?style=for-the-badge) ![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript) ![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-38B2AC?style=for-the-badge&logo=tailwind-css)

Revalta är nästa generations AI-drivna fastighetsplattform, byggd för prestanda, extrem säkerhet och en förstklassig användarupplevelse. Denna plattform är noggrant arkitekterad enligt Enterprise-standard.

---

## 🏗 Projektstruktur
Plattformen är organiserad med Next.js App Router för maximal modularitet:
- **`/(marketing)`**: Landningssidor, priser, publika ytor (hög SEO-optimering).
- **`/dashboard`**: För inloggade hyresgäster och fastighetsförvaltare. Låst bakom Edge Middleware.
- **`/admin`**: Super-admin panel för plattformsägare (isolerad miljö, mörkt tema).
- **`/actions`**: Next.js Server Actions som sköter all mutation (ingen osäker API-klient).
- **`/lib`**: Centraliserad affärslogik (`session.ts`, `prisma.ts`, `permissions.ts`).
- **`/components/ui`**: Egna premium UI-komponenter byggda ovanpå Tailwind.

## 🗄 Prisma Schema & PostgreSQL
Data-arkitekturen i `prisma/schema.prisma` är designad för **Multi-Tenancy** (flerföretagsstöd):
- Alla `User`, `Property` och `Ticket` är strikt kopplade till ett `Company`.
- Automatiska statusfält (`active`, `blocked`, `deleted`) för mjuk radering.
- Komplett databas-migrering körs mot Vercel Postgres för blixtsnabba svarstider.

## 🔒 Permissions Engine & RBAC
Vi använder en Role-Based Access Control (RBAC) motor definierad i `src/lib/permissions.ts`.
- Roller: `super_owner`, `internal_admin`, `company_owner`, `property_manager` osv.
- Middlewaren körs på **Vercels Edge Network** och validerar säkerhetskrav, spärrade konton och blockerat företag på *under 1 millisekund* innan användaren ens når sidan.

## 🔑 Autentisering & Lösenordshantering
- **Ingen tung tredjepart:** Autentiseringen är 100% custom-byggd med biblioteket `jose`.
- **Säkerhet:** Stateless JWT-tokens (JSON Web Tokens) krypteras och lagras i en `httpOnly`, `Secure`, `SameSite=Lax` cookie. Detta är immunt mot XSS.
- **Password Hashing:** Lösenord hashas med `bcryptjs` via centrala `src/lib/password.ts`. Inga klartextlösenord nuddar någonsin loggarna.

## 🧠 AI Service Grund
Modulen `src/lib/ai/ticketAnalyzer.ts` är plattformens hjärna för felanmälningar.
- Scannar automatiskt fritekst från hyresgäster.
- Identifierar högriskord (t.ex. "läckage", "brand", "rök").
- Kategoriserar (VVS, El, Passagesystem) och poängsätter risken (1-100) för att automatiskt sortera ärenden i fastighetsskötarens inkorg.

---

### Starta Projektet Lokalt
1. Klon ned repon.
2. Sätt upp din lokala PostgreSQL i `.env` (`DATABASE_URL`).
3. Sätt en stark `SESSION_SECRET` i `.env`.
4. Kör `npx prisma db push` (eller `npx prisma migrate dev`).
5. Kör `npm run dev`.

*Revalta bygger på kvalitet. Inga genvägar. Endast perfektion.*
