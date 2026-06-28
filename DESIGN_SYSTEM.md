# Revalta design system

Revalta ska kännas som en svensk premium B2B SaaS-/proptech-plattform för fastighetsförvaltning: rent, ljust, tryggt, modernt och professionellt.

## Visuell riktning

- Skandinavisk premiumkänsla.
- Vit, sand och beige som bas.
- Petroleum/djup grön som primär färg.
- Mörk text med hög läsbarhet.
- Tunna borders, mjuka skuggor och generöst med spacing.
- Seriös känsla inspirerad av svensk bank, Hemnet, Fortnox, Vitec, Notion och Linear.

## Tokens

Använd tokens från `tailwind.config.ts`:

- Primär färg: `petroleum-*`
- Bakgrund och ytor: `sand-*`, vit och `#FDFCFB`
- Text: `ink-*`
- Skuggor: `shadow-premium-sm`, `shadow-premium-md`, `shadow-premium-lg`
- Status: `success-*`, `warning-*`, `danger-*`

## Komponentprinciper

- Knappar ska vara tydliga men inte högljudda.
- Cards ska ha vit bakgrund, sandfärgade tunna borders och mjuk skugga.
- Inputs ska vara rena, ljusa och fokusera med petroleum-ring.
- Badges ska använda lågmälda statusfärger.
- Animationer ska vara diskreta och får inte kännas startup/gaming.

## Undvik

- Neonfärger.
- Dark mode som standard.
- Glassmorphism eller kraftig blur på cards.
- Stora gradients som bär hela layouten.
- För många färger i samma vy.
- Nya designspråk vid sidan av Antigravity-layouten.

## Vid ny utveckling

1. Kontrollera befintliga komponenter i `src/components`.
2. Återanvänd tokens innan nya klasser eller färger skapas.
3. Skriv svensk, tydlig UI-copy.
4. Bygg luftigt och konsekvent.
5. Säkerställ att ny UI passar bredvid startsidan och boendeportalen.
