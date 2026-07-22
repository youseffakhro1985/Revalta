import { expect, test } from "@playwright/test";

test("startsidan har korrekt metadata, huvudnavigation och tangentbordsgenväg", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Revalta | Fastighetssystem för svensk förvaltning");
  await expect(page.getByRole("heading", { level: 1, name: "Ett lugnare sätt att förvalta fastigheter." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Huvudmeny" })).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.revalta.se/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/opengraph-image/);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Hoppa till innehåll" })).toBeFocused();
});

test("inloggning och registrering har tillgängliga svenska formulär", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Logga in" })).toBeVisible();
  await expect(page.getByLabel("E-post")).toHaveAttribute("autocomplete", "email");
  await expect(page.getByLabel("Lösenord")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Skapa konto" })).toBeVisible();
  await expect(page.getByRole("button", { name: /skapa/i })).toBeVisible();
});

test("privata ytor omdirigerar och skickar skyddande headers", async ({ page, request }) => {
  const redirect = await request.get("/dashboard", { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers()["x-robots-tag"]).toContain("noindex");
  expect(redirect.headers()["cache-control"]).toContain("no-store");

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test("robots och sitemap publicerar endast avsedda publika ytor", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /dashboard/");
  expect(robotsText).toContain("Sitemap: https://www.revalta.se/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("https://www.revalta.se/juridik/integritet");
  expect(sitemapText).not.toContain("/dashboard");
  expect(sitemapText).not.toContain("/portal");
});

test("juridiska sidor har canonical och konsekvent navigation", async ({ page }) => {
  await page.goto("/juridik/integritet");

  await expect(page.getByRole("heading", { level: 1, name: "Integritetspolicy" })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.revalta.se/juridik/integritet");
  await expect(page.getByRole("contentinfo")).toBeVisible();
});
