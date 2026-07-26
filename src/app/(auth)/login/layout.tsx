import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Logga in | Revalta" },
  description: "Logga in säkert i Revalta för att arbeta med organisationens fastigheter, ärenden och arbetsorder.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
