# Revalta design system

Revalta ska kännas som en svensk premium B2B SaaS-/proptech-plattform för fastighetsförvaltning: rent, ljust, tryggt, modernt och professionellt.

## Visuell riktning

- Skandinavisk premiumkänsla.
- Varmvit, sand och lågmäld beige som bas.
- Petroleum/djup grön som primär färg.
- Varm mörkgrå/kolsvart text med hög läsbarhet.
- Tunna borders, mjuka skuggor och generöst med spacing.
- Seriös känsla inspirerad av svensk bank, Hemnet, Fortnox, Vitec, Notion och Linear.
- Färgerna ska kännas dämpade, naturliga och arkitektoniska snarare än starka eller tekniska.

## Färgbalans

Revaltas UI ska huvudsakligen bestå av neutrala premiumytor. Petroleum används för identitet, primära handlingar, fokus och navigationsmarkeringar — inte som dekor överallt.

- Cirka 70–80 % av en normal dashboardvy: varmvit/sand/ljus neutral yta.
- Cirka 15–20 %: mörk text, borders och sekundära neutrala toner.
- Cirka 5–10 %: petroleum/djup grön och nödvändiga statusfärger.
- Sand/beige får användas som varm accent i små detaljer, diagram och aktiva markeringar.
- Statusfärger används bara när de bär betydelse: framgång, varning eller fel.

## Tokens

Använd tokens från `tailwind.config.ts`:

- Primär färg: `petroleum-*`
- Bakgrund och ytor: `sand-*`, vit och `#FDFCFB`
- Text: `ink-*`
- Skuggor: `shadow-premium-sm`, `shadow-premium-md`, `shadow-premium-lg`
- Status: `success-*`, `warning-*`, `danger-*`

Petroleum-, sand- och ink-skalorna är medvetet något varmare och mer dämpade för att ge en svensk premiumkänsla och bättre samspel med fastighetsfotografi, tabeller och ekonomidata.

## Komponentprinciper

- Knappar ska vara tydliga men inte högljudda.
- Cards ska ha vit eller mycket varmvit bakgrund, sandfärgade tunna borders och mjuk skugga.
- Inputs ska vara rena, ljusa och fokusera med petroleum-ring.
- Badges ska använda lågmälda statusfärger.
- Dashboardens vänsterspalt ska normalt använda `petroleum-900`: mörk nog för tydlig navigationskontrast, men något mjukare och ljusare än `petroleum-950` för en lugn svensk premiumkänsla.
- `petroleum-950` reserveras för mindre, tydliga primära handlingar och extra mörka detaljer där hög kontrast behövs.
- Diagram ska i första hand använda petroleum, sand/beige och neutrala ink-toner. Fler färger används bara när datan kräver det.
- Animationer ska vara diskreta och får inte kännas startup/gaming.

## Undvik

- Neonfärger.
- Klarblå standard-SaaS som primär identitetsfärg.
- Dark mode som standard.
- Glassmorphism eller kraftig blur på cards.
- Stora gradients som bär hela layouten.
- För många färger i samma vy.
- Färg för dekoration när typografi, spacing eller hierarki räcker.
- Nya designspråk vid sidan av Antigravity-layouten.

## Vid ny utveckling

1. Kontrollera befintliga komponenter i `src/components`.
2. Återanvänd tokens innan nya klasser eller färger skapas.
3. Skriv svensk, tydlig UI-copy.
4. Bygg luftigt och konsekvent.
5. Säkerställ att ny UI passar bredvid startsidan och boendeportalen.
6. Kontrollera att en ny vy fortfarande känns premium även om all statusfärg tas bort — färg ska stödja hierarkin, inte skapa den.