import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.revalta.se"),
  title: {
    default: "Revalta | Fastighetssystem för svensk förvaltning",
    template: "%s | Revalta",
  },
  description: "Revalta samlar fastigheter, ärenden, avtal och ekonomi i ett modernt system för svenska fastighetsägare, BRF:er och förvaltare.",
  manifest: "/manifest.webmanifest",
  applicationName: "Revalta",
  icons: { icon: "/icons/revalta-icon.svg", apple: "/icons/revalta-icon.svg" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Revalta",
    title: "Revalta | Fastighetssystem för svensk förvaltning",
    description: "Samlad fastighetsförvaltning för svenska fastighetsägare, BRF:er och förvaltare.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Revalta – svensk fastighetsförvaltning" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Revalta | Fastighetssystem för svensk förvaltning",
    description: "Samlad fastighetsförvaltning för svenska fastighetsägare, BRF:er och förvaltare.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#214E46",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body className={`${inter.variable} ${manrope.variable} font-sans antialiased`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
