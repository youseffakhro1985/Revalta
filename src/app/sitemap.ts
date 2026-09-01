import type { MetadataRoute } from "next";

const siteUrl = "https://www.revalta.se";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/demo`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...["integritet", "cookies", "villkor", "gdpr"].map((slug) => ({
      url: `${siteUrl}/juridik/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
