import { Suspense } from "react";
import { TournamentsLoader } from "@/components/tournaments-loader";
import Loading from "../loading";

export default function TournamentsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TournamentsLoader />
    </Suspense>
  );
}
