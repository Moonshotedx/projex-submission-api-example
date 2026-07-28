import { Suspense } from "react";
import { Explorer } from "@/components/explorer";

export default async function CohortPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;

  return (
    <Suspense fallback={null}>
      <Explorer routeCohortId={cohortId} />
    </Suspense>
  );
}
