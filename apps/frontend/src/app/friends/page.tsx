import { Suspense } from "react";
import { FriendsConsole } from "@/components/friends-console";
import Loading from "../loading";

export default function FriendsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FriendsConsole />
    </Suspense>
  );
}
