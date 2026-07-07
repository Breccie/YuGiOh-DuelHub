import { redirect } from "next/navigation";
import { getViewerSession, listRecentAccounts } from "@/lib/auth";
import { LoginScreen } from "@/components/login-screen";

export default async function LoginPage() {
  const session = await getViewerSession();

  if (session) {
    redirect("/campaigns");
  }

  const recentAccounts = await listRecentAccounts();

  return <LoginScreen recentAccounts={recentAccounts} />;
}
