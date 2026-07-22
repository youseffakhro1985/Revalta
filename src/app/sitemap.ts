import type { MetadataRoute } from "next";

const publicPaths = [
  "",
  "/juridik/integritet",
  "/juridik/cookies",
  "/juridik/villkor",
  "/juridik/gdpr",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path, index) => ({
    url: `https://www.revalta.se${path}`,
    changeFrequency: index === 0 ? "weekly" : "yearly",
    priority: index === 0 ? 1 : 0.3,
  }));
}
