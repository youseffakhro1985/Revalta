import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Revalta | Fastighetssystem för svensk förvaltning",
  description: "Revalta samlar fastigheter, ärenden, avtal och ekonomi i ett modernt system för svenska fastighetsägare, BRF:er och förvaltare.",
  manifest: "/manifest.webmanifest",
  applicationName: "Revalta",
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
