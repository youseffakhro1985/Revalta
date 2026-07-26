import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptera inbjudan",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function AcceptInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
