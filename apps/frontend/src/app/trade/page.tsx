import { Suspense } from "react";
import { TradeOverviewLoader } from "@/components/trade-overview-loader";
import Loading from "../loading";

export default function TradePage() {
  return (
    <Suspense fallback={<Loading />}>
      <TradeOverviewLoader />
    </Suspense>
  );
}
