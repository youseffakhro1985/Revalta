import { PublicPortalClient } from "@/components/portal/public-portal-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Boendeportal",
  description: "Felanmälan och ärendeuppföljning för boende hos en organisation som använder Revalta.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PortalPage() {
  return <PublicPortalClient />;
}
