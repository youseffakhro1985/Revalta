import { redirect } from "next/navigation";

export default async function LegacyWorkOrderDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/arbetsorder/${id}`);
}
