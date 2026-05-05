# Revalta – Fastighetsförvaltning och Felanmälan

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-38B2AC?style=for-the-badge&logo=tailwind-css)

Revalta är en modern plattform för fastighetsförvaltning och felanmälan, byggd med fokus på enkelhet, snabbhet och säkerhet.

---

## 🏗 Projektstruktur

Plattformen är organiserad med Next.js App Router:

- **`/(auth)`**: Sidor för inloggning och registrering (`/login`, `/register`).
- **`/(dashboard)`**: Huvudpanelen för inloggade användare.
  - **`/dashboard/felanmalan`**: Hantering och skapande av nya felanmälningar.
- **`/api`**: REST API-rutter för autentisering och datahantering (`/api/auth`, `/api/tickets`).
- **`/components`**: UI-komponenter, layout-element och specifika vyer.
- **`/lib`**: Centraliserad logik för databas (`db.ts`), autentisering (`auth.ts`) och AI-tjänster (`ai.ts`).

## 🗄 Databas & Backend

- **PostgreSQL 15** körs lokalt via Docker (`docker-compose.yml`).
- **Prisma ORM** hanterar schema, migrationer och databasåtkomst (`prisma/schema.prisma`).
- Schemat inkluderar tabellerna `User` och `Ticket`.

## 🔑 Autentisering

- Egenbyggd och säker autentisering med JWT.
- **`jose`**: Används för att signera och verifiera JSON Web Tokens.
- **`bcryptjs`**: Används för att hasha lösenord innan de sparas i databasen.

## 🧠 AI Integration (Kommande)

- `src/lib/ai.ts` är förberedd för att framöver hantera automatisk kategorisering och prioritering av inkommande felanmälningar.

---

## 🚀 Starta Projektet Lokalt

### Förutsättningar

- [Node.js](https://nodejs.org/) (v20+)
- [Docker](https://www.docker.com/) (för PostgreSQL)

### Installation

1. Klona repot:
   ```bash
   git clone <repo-url>
   cd revalta
   ```

2. Kopiera och konfigurera miljövariabler:
   ```bash
   cp .env.example .env
   ```

3. Starta databasen:
   ```bash
   docker compose up -d
   ```

4. Installera beroenden:
   ```bash
   npm install
   ```

5. Kör databasmigrering:
   ```bash
   npx prisma migrate deploy
   ```

6. Starta utvecklingsservern:
   ```bash
   npm run dev
   ```

7. Öppna [http://localhost:3000](http://localhost:3000) i din webbläsare.

---

## 📋 Tillgängliga Kommandon

| Kommando | Beskrivning |
|----------|-------------|
| `npm run dev` | Starta utvecklingsserver (port 3000) |
| `npm run build` | Bygg för produktion |
| `npm run start` | Kör produktionsbygge |
| `npm run lint` | Kör ESLint |
| `npm test` | Kör tester (Vitest) |
| `npx prisma migrate dev` | Skapa och kör ny migrering |
| `npx prisma migrate deploy` | Applicera befintliga migreringar |
| `npx prisma studio` | Öppna Prisma Studio (databas-GUI) |

---

## 🧪 Testning

Projektet använder [Vitest](https://vitest.dev/) för automatiserade tester:

```bash
npm test           # Kör alla tester
npm run test:ci    # Kör tester i CI-läge (utan watch)
```

Tester finns i `__tests__/`-katalogen och testar API-rutter, autentisering och affärslogik.

---

## 🔧 Miljövariabler

Se `.env.example` för alla tillgängliga variabler och deras standardvärden.
