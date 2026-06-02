import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Revalta | Svenskt Fastighetssystem",
  description: "Ett premiumverktyg för modern svensk fastighetsförvaltning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" className="scroll-smooth">
      <body className={`${manrope.className} antialiased text-ink-900 bg-background`}>{children}</body>
    </html>
  );
}
