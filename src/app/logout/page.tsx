import { redirect } from "next/navigation";
import { deleteSession } from "@/lib/session";

export default async function LogoutPage() {
  await deleteSession();
  redirect("/login");
}
