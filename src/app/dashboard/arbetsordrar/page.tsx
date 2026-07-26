import { redirect } from "next/navigation";

export default function LegacyWorkOrdersIndexPage() {
  redirect("/dashboard/arbetsordrar/operationsoversikt");
}
