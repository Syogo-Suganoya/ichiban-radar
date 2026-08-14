import { NextResponse } from "next/server";

import { rateLimited, route } from "@/lib/api";

import { getDataSource } from "@/lib/data";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { isPremium } from "@/lib/billing";

/**
 * 一般ユーザーの認証。
 *
 * ログインは**任意**。未ログインでも地図と店舗詳細は使える。
 * ログインで増えるのは、お気に入り登録と在庫急変の通知だけ。
 *
 * ⚠️ 管理画面（/api/admin/auth）とはセッションが完全に別。
 */

const MIN_PASSWORD_LENGTH = 8;

export const POST = route(async (request: Request) => {
  const body = (await request.json()) as {
    action?: "login" | "register" | "logout";
    email?: string;
    password?: string;
    displayName?: string;
  };

  const source = getDataSource();

  // ログアウト以外は総当たりの的になる
  if (body.action !== "logout") {
    const limited = rateLimited(request, "auth", { limit: 10, windowSec: 600 });
    if (limited) return limited;
  }

  if (body.action === "logout") {
    await destroySession("user");
    return NextResponse.json({ ok: true });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください" },
      { status: 400 },
    );
  }

  if (body.action === "register") {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
        { status: 400 },
      );
    }
    if (await source.findUserByEmail(email)) {
      return NextResponse.json({ error: "このメールアドレスは登録済みです" }, { status: 409 });
    }

    const user = await source.createUser({
      email,
      displayName: body.displayName?.trim() || email.split("@")[0],
      passwordHash: hashPassword(password),
      premiumUntil: null,
      stripeCustomerId: null,
    });
    await createSession("user", user.id);
    return NextResponse.json({
      ok: true,
      displayName: user.displayName,
      favorites: [],
      premium: isPremium(user),
    });
  }

  // --- ログイン ---
  const user = await source.findUserByEmail(email);
  // 存在しない場合もパスワード違いと同じ応答にして、登録済みかを推測させない
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが違います" },
      { status: 401 },
    );
  }

  await createSession("user", user.id);
  return NextResponse.json({
    ok: true,
    displayName: user.displayName,
    favorites: await source.listFavorites(user.id),
    premium: isPremium(user),
  });
});
