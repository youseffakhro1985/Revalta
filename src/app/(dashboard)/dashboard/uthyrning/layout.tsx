import type { ReactNode } from "react";
import { LeaseLifecycleCenter } from "@/components/leasing/lease-lifecycle-center";

export default function LeasingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      {children}
      <LeaseLifecycleCenter />
    </div>
  );
}
