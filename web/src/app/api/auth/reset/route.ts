import { NextResponse } from "next/server";

import { rateLimited, route } from "@/lib/api";

import { createResetToken, hashPassword, verifyResetToken } from "@/lib/auth";
import { getDataSource } from "@/lib/data";
import { passwordResetMail, send } from "@/lib/mail";

/**
 * パスワード再設定。
 *
 * ★ トークンはDBに持たない。署名の材料に現在のパスワードハッシュを混ぜてあるので、
 *   一度使えば（＝パスワードが変われば）同じトークンは自動的に無効になる。
 *
 * ⚠️ **RESEND_API_KEY が未設定だと、リンクはログに出るだけで利用者に届かない。**
 *   その状態ではこの機能は運用に乗せられない（lib/mail.ts）。
 */

const MIN_PASSWORD_LENGTH = 8;

export const POST = route(async (request: Request) => {
  const body = (await request.json()) as {
    action?: "request" | "confirm";
    email?: string;
    token?: string;
    password?: string;
  };

  const source = getDataSource();

  // --- 再設定リンクの発行 ---
  if (body.action === "request") {
    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });
    }

    // ⚠️ メールアドレス単位でも絞る。IPだけだと、攻撃者が回線を変えながら
    //    同じ宛先に送信を繰り返せてしまう（メール爆撃）
    const limited =
      rateLimited(request, "reset-ip", { limit: 5, windowSec: 600 }) ??
      rateLimited(request, "reset-mail", { limit: 3, windowSec: 3600 }, email);
    if (limited) return limited;

    const user = await source.findUserByEmail(email);

    if (user) {
      const token = createResetToken(user.id, user.passwordHash);
      const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset?token=${token}`;

      // ⚠️ 送信結果は応答に反映しない。反映すると、
      //    登録済みメールアドレスの判定に使えてしまう
      await send(passwordResetMail(user.email, url));
    }

    // ⚠️ 登録の有無で応答を変えない。変えると、
    //    このAPIがメールアドレスの登録確認に使えてしまう
    return NextResponse.json({
      ok: true,
      message: "ご登録のメールアドレス宛に再設定用のリンクをお送りしました。",
    });
  }

  // --- 新しいパスワードの設定 ---
  if (body.action === "confirm") {
    const token = body.token ?? "";
    const password = body.password ?? "";

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
        { status: 400 },
      );
    }

    // 検証にはトークンが指す利用者の「現在の」ハッシュが要る。
    // 先に候補を引いてから照合する
    const userId = await resolveUserId(token);
    if (!userId) {
      return NextResponse.json(
        { error: "リンクが無効か、有効期限が切れています。もう一度お試しください。" },
        { status: 400 },
      );
    }

    await source.updateUserPassword(userId, hashPassword(password));

    // セッションは張らない。新しいパスワードで明示的にログインさせる
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action が不正です" }, { status: 400 });
});

/** トークンから利用者を特定する */
async function resolveUserId(token: string): Promise<string | null> {
  const encoded = token.split(".")[0];
  if (!encoded) return null;

  let userId: string;
  try {
    userId = Buffer.from(encoded, "base64url").toString().split(".")[0];
  } catch {
    return null;
  }

  const user = await getDataSource().findUserById(userId);
  if (!user) return null;

  // ここで初めて署名を検証する。ハッシュが変わっていれば通らない
  return verifyResetToken(token, (id) => (id === user.id ? user.passwordHash : null));
}
