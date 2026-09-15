import { ProjectsPage } from "./projekt-page";

export default async function ProjektRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <ProjectsPage initialCreate={params.create === "1"} />;
}
