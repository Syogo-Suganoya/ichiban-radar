import { redirect } from "next/navigation";

/**
 * 旧LPのURL。トップページへ恒久的に転送する。
 *
 * ★ LPを `/` へ移す前に、この `/lp` を共有してしまっている可能性がある。
 *   リンクを踏んだ人を404で突き放さないための一行。
 */
export default function LegacyLandingPage() {
  redirect("/");
}
