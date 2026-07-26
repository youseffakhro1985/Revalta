import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Skapa konto | Revalta" },
  description: "Skapa en säker arbetsyta i Revalta för organisationens fastighetsförvaltning.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
