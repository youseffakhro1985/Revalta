import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Välj nytt lösenord",
  description: "Välj ett nytt lösenord för ditt Revalta-konto.",
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
