import { Explorer } from "@/components/explorer";

export default async function CohortPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;

  return <Explorer routeCohortId={cohortId} />;
}
