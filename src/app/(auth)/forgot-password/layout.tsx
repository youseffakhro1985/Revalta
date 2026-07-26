import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Återställ lösenord | Revalta" },
  description: "Begär en säker återställningslänk för ditt Revalta-konto.",
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
