import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Revalta – Svensk fastighetsförvaltning",
    short_name: "Revalta",
    description: "Samlad fastighetsförvaltning för fastighetsägare, BRF:er och förvaltare.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F7F7F3",
    theme_color: "#214E46",
    orientation: "portrait-primary",
    lang: "sv-SE",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/revalta-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
