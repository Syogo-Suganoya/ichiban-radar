import { NextResponse } from "next/server";

import { rateLimited, route } from "@/lib/api";

import { getDataSource } from "@/lib/data";
import {
  checkSignupCode,
  createSession,
  destroySession,
  hashPassword,
  signupCodeRequired,
  verifyPassword,
} from "@/lib/auth";

/**
 * 管理画面の認証。
 *
 * 一般ユーザー向け画面にはログインを作らないため、
 * アカウントを持つのは在庫確認コンソールの利用者だけ。
 */

const MIN_PASSWORD_LENGTH = 8;

/** 招待コードが必要かをログイン画面に伝える */
export const GET = route(async () => {
  return NextResponse.json({ signupCodeRequired: signupCodeRequired() });
});

export const POST = route(async (request: Request) => {
  // 管理画面は権限が強い。一般ユーザーより厳しく絞る
  const limited = rateLimited(request, "admin-auth", { limit: 5, windowSec: 600 });
  if (limited) return limited;

  const body = (await request.json()) as {
    action?: "login" | "register" | "logout";
    email?: string;
    password?: string;
    displayName?: string;
    signupCode?: string;
  };

  const source = getDataSource();

  if (body.action === "logout") {
    await destroySession("admin");
    return NextResponse.json({ ok: true });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードを入力してください" }, { status: 400 });
  }

  if (body.action === "register") {
    if (!checkSignupCode(body.signupCode)) {
      return NextResponse.json({ error: "招待コードが違います" }, { status: 403 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
        { status: 400 },
      );
    }
    if (await source.findOperatorByEmail(email)) {
      return NextResponse.json({ error: "このメールアドレスは登録済みです" }, { status: 409 });
    }

    const operator = await source.createOperator({
      email,
      displayName: body.displayName?.trim() || email.split("@")[0],
      passwordHash: hashPassword(password),
    });
    await createSession("admin", operator.id);
    return NextResponse.json({ ok: true, operatorId: operator.id });
  }

  // --- ログイン ---
  const operator = await source.findOperatorByEmail(email);
  // 存在しない場合もパスワード違いと同じ応答にして、登録済みかを推測させない
  if (!operator || !verifyPassword(password, operator.passwordHash)) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが違います" },
      { status: 401 },
    );
  }

  await createSession("admin", operator.id);
  return NextResponse.json({ ok: true, operatorId: operator.id });
});
