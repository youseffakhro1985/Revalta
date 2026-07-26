import { redirect } from "next/navigation";

export default async function LegacyWorkOrderMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/arbetsorder/${id}`);
}
