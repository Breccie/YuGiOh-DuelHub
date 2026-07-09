import { Suspense } from "react";
import { TradeCreateLoader } from "@/components/trade-create-loader";
import Loading from "../../loading";

export default function TradeCreatePage() {
  return (
    <Suspense fallback={<Loading />}>
      <TradeCreateLoader />
    </Suspense>
  );
}
