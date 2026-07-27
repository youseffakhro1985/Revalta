import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const siteDescription =
  "Revalta samlar fastigheter, ärenden, avtal och ekonomi i ett modernt system för svenska fastighetsägare, BRF:er och förvaltare.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.revalta.se"),
  title: {
    default: "Revalta | Fastighetssystem för svensk förvaltning",
    template: "%s | Revalta",
  },
  description: siteDescription,
  manifest: "/manifest.webmanifest",
  applicationName: "Revalta",
  category: "business",
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Revalta",
    title: "Revalta | Fastighetssystem för svensk förvaltning",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Revalta | Fastighetssystem för svensk förvaltning",
    description: siteDescription,
  },
  icons: { icon: "/icons/revalta-icon.svg", apple: "/icons/revalta-icon.svg" },
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
