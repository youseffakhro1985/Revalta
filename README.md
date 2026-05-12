# Revalta – Fastighetsförvaltning och Felanmälan

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript) ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-38B2AC?style=for-the-badge&logo=tailwind-css)

Revalta är en modern plattform för fastighetsförvaltning och felanmälan, byggd med fokus på enkelhet, snabbhet och säkerhet enligt den nya arkitekturen.

---

## 🏗 Projektstruktur
Plattformen är organiserad med Next.js App Router:
- **`/(auth)`**: Sidor för inloggning och registrering (`/login`, `/register`).
- **`/(dashboard)`**: Huvudpanelen för inloggade användare.
  - **`/dashboard/felanmalan`**: Hantering och skapande av nya felanmälningar.
- **`/api`**: REST API-rutter för autentisering och datahantering (`/api/auth`, `/api/tickets`).
- **`/components`**: UI-komponenter, layout-element och specifika vyer.
- **`/lib`**: Centraliserad logik för databas (`db.ts`), autentisering (`auth.ts`) och framtida AI-tjänster (`ai.ts`).

## 🗄 Databas & Backend
För maximal snabbhet och minimerat krångel använder vi en lokal SQLite-databas:
- **`better-sqlite3`**: Blixtsnabb, synkron SQLite-klient.
- **`scripts/migrate.js`**: Hanterar skapandet av tabeller (`users` och `tickets`).

## 🔑 Autentisering
- Egenbyggd och säker autentisering med JWT.
- **`jose`**: Används för att signera och verifiera JSON Web Tokens säkert.
- **`bcryptjs`**: Används för att hasha lösenord innan de sparas i databasen.

## 🧠 AI Integration (Kommande)
- `src/lib/ai.ts` är förberedd för att framöver hantera automatisk kategorisering och prioritering av inkommande felanmälningar.

---

### 🚀 Starta Projektet Lokalt
1. Klon ned reponet.
2. Installera beroenden:
   ```bash
   npm install
   ```
3. Kör databasmigreringen för att skapa din lokala `dev.db`:
   ```bash
   npm run db:migrate
   ```
4. Starta utvecklingsservern:
   ```bash
   npm run dev
   ```
5. Öppna [http://localhost:3000](http://localhost:3000) i din webbläsare. 

