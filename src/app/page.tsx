import { Suspense } from "react";
import { Explorer } from "@/components/explorer";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Explorer />
    </Suspense>
  );
}
