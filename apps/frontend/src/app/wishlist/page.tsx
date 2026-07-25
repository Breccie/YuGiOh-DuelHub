import { redirect } from "next/navigation";
import { WishlistConsole } from "@/components/wishlist-console";
import { shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getOnlineViewerSession } from "@/lib/online-session";
import { getPrisma } from "@/lib/prisma";

export default async function WishlistPage() {
  if (shouldProxyToApiService()) {
    return <WishlistConsole session={await getOnlineViewerSession()} />;
  }

  const session = await getViewerSession(getPrisma());
  if (!session) redirect("/login");
  return <WishlistConsole session={session} />;
}
