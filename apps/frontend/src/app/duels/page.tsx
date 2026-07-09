import { Suspense } from "react";
import { DuelsLoader } from "@/components/duels-loader";
import Loading from "../loading";

export default function DuelsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DuelsLoader />
    </Suspense>
  );
}
