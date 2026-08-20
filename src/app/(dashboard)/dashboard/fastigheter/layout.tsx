import { FastigheterMapDock } from "@/components/dashboard/fastigheter-map-dock";

export default function FastigheterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FastigheterMapDock />
    </>
  );
}
