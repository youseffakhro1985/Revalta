import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getAllTickets } from "@/lib/tickets";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tickets = getAllTickets();
  const user = {
    name: session.user?.name || "",
    email: session.user?.email || "",
    role: (session.user as any)?.role || "customer",
  };

  return <DashboardClient user={user} initialTickets={tickets} />;
}
