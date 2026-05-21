# Revalta – Fastighetsförvaltning och Felanmälan

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-38B2AC?style=for-the-badge&logo=tailwind-css)

Revalta är en modern plattform för fastighetsförvaltning och felanmälan, byggd med fokus på tydliga flöden, säker inloggning och en professionell dashboard.

---

## 🏗 Projektstruktur
Plattformen är organiserad med Next.js App Router:
- **`/(auth)`**: Sidor för inloggning och registrering (`/login`, `/register`).
- **`/(dashboard)`**: Skyddad huvudpanel för inloggade användare.
  - **`/dashboard/team`**: Hantera organisation, roller och teammedlemmar.
  - **`/dashboard/fastigheter`**: Skapa och lista fastigheter i beståndet.
  - **`/dashboard/felanmalan`**: Skapa, lista, tilldela och kommentera felanmälningar kopplade till fastighet.
- **`/api`**: REST API-rutter för autentisering och datahantering (`/api/auth`, `/api/tickets`).
- **`/components`**: UI-komponenter, layout-element och specifika vyer.
- **`/lib`**: Centraliserad logik för databas (`db.ts`), sessioner (`session.ts`) och autentisering (`auth.ts`).

## 🗄 Databas & Backend
Backend använder Prisma mot PostgreSQL:
- **`prisma/schema.prisma`**: Datamodeller för företag, användare, roller, fastigheter, felanmälningar och kommentarer.
- **`src/app/api/auth/*`**: Registrering, inloggning och utloggning.
- **`src/app/api/team`**: Lista och skapa teammedlemmar inom organisationen.
- **`src/app/api/properties`**: Lista och skapa fastigheter för inloggad användare.
- **`src/app/api/tickets`**: Lista och skapa ärenden med kategori, prioritet, ansvarig och fastighet.
- **`src/app/api/tickets/[id]`**: Hämta och uppdatera ett specifikt ärende.
- **`src/app/api/tickets/[id]/comments`**: Lägg till kommentarer på ärenden.
- **`src/app/api/tickets/[id]/attachments`**: Ladda upp små dev-bilagor på ärenden.
- **`src/app/api/tickets/[id]/ai`**: AI-analysera och uppdatera kategori/prioritet/sammanfattning.
- **`src/app/api/billing`**: Visa och ändra plan i Stripe-ready mockläge.
- **`src/app/api/audit`**: Audit log för viktiga händelser.
- **`src/app/api/integrations`**: Konfigurationsstatus och dev-mockade händelser för e-post, SMS, Stripe, storage och AI.

## 🔑 Autentisering
- Egenbyggd och säker autentisering med JWT.
- **`jose`**: Används för att signera och verifiera JSON Web Tokens säkert.
- **`bcryptjs`**: Används för att hasha lösenord innan de sparas i databasen.

## 🔒 Sessioner
- JWT lagras som httpOnly-cookie.
- `/dashboard` skyddas via `proxy.ts`.
- `JWT_SECRET` ska alltid sättas i produktionsmiljö.

## 🔌 Externa integrationer
- E-post, SMS, Stripe, storage och AI körs som fullt spårbara dev-mockar om leverantörsnycklar saknas.
- Sätt nycklarna i `.env` enligt `.env.example` för att koppla riktiga leverantörer.
- Alla mockade/queue:ade integrationshändelser sparas i `IntegrationEvent`.

---

### 🚀 Starta Projektet Lokalt
1. Klon ned reponet.
2. Installera beroenden:
   ```bash
   npm install
   ```
3. Skapa `.env` från `.env.example` och fyll i PostgreSQL-URL:er samt `JWT_SECRET`.
4. Kör Prisma-migrationer:
   ```bash
   npm run db:dev
   ```
5. Starta utvecklingsservern:
   ```bash
   npm run dev
   ```
cursor/professional-mvp-6157
6. Öppna [http://localhost:3000](http://localhost:3000) i din webbläsare.

5. Öppna [http://localhost:3000](http://localhost:3000) i din webbläsare. 

main
