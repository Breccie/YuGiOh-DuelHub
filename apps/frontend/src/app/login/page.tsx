import { redirect } from "next/navigation";
import { getViewerSession, listRecentAccounts } from "@/lib/auth";
import { LoginScreen } from "@/components/login-screen";
import { shouldProxyToApiService } from "@/lib/api-service-proxy";

export default async function LoginPage() {
  if (shouldProxyToApiService()) {
    return <LoginScreen recentAccounts={[]} showDemoAccounts={false} />;
  }

  const session = await getViewerSession();

  if (session) {
    redirect("/campaigns");
  }

  const recentAccounts = await listRecentAccounts();

  return <LoginScreen recentAccounts={recentAccounts} showDemoAccounts />;
}
