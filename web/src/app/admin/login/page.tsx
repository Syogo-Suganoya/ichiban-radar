import { redirect } from "next/navigation";

import LoginForm from "@/components/admin/LoginForm";
import { getSessionOperatorId, signupCodeRequired } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ログイン | 在庫確認コンソール",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await getSessionOperatorId()) redirect("/admin");

  return <LoginForm signupCodeRequired={signupCodeRequired()} />;
}
