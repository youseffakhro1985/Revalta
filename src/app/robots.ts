import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/juridik/"],
      disallow: [
        "/api/",
        "/dashboard/",
        "/portal/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/accept-invite",
        "/verify-email",
        "/arbetsrapport/",
        "/underhallsrapport/",
      ],
    },
    sitemap: "https://www.revalta.se/sitemap.xml",
    host: "https://www.revalta.se",
  };
}
