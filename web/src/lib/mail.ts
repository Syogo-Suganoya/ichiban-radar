import "server-only";

/**
 * メール送信。
 *
 * ★ **APIキーが無ければ送らず、内容をログに出す**（他の外部連携と同じ方針）。
 *   これにより、送信基盤を契約する前でも再設定フローを通しで動作確認できる。
 *
 * ⚠️ ただし**ログ出力は運用に乗せられない**。利用者にリンクが届かないため、
 *   パスワード再設定は実質的に使えない状態のままである。
 *   公開前に RESEND_API_KEY を設定すること（TODO.md）。
 *
 * 実装は Resend を選んでいる。理由は、
 *   - HTTP APIだけで完結し、SDKを足さなくても fetch で送れる
 *   - 独自ドメインの認証（SPF/DKIM）が管理画面で完結する
 * 他社に替える場合も、差し替えるのは send() の中だけで済む。
 */

interface Mail {
  to: string;
  subject: string;
  /** プレーンテキスト。HTMLメールは迷惑メール判定を受けやすいので使わない */
  text: string;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/**
 * 送信する。失敗しても例外は投げず false を返す。
 *
 * ⚠️ 呼び出し側は結果で応答を変えないこと。
 *   「送れたかどうか」を返すと、登録済みメールアドレスの判定に使われる。
 */
export async function send(mail: Mail): Promise<boolean> {
  if (!isMailConfigured()) {
    console.warn(
      `[mail] RESEND_API_KEY / MAIL_FROM が未設定のため送信しません（内容をログ出力）\n` +
        `       宛先: ${mail.to}\n       件名: ${mail.subject}\n${mail.text}`,
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
      // 送信基盤の不調でリクエストを道連れにしない
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[mail] 送信に失敗しました: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[mail] 送信に失敗しました:", error);
    return false;
  }
}

/** パスワード再設定の案内 */
export function passwordResetMail(to: string, url: string): Mail {
  return {
    to,
    subject: "【くじレーダー】パスワード再設定のご案内",
    text: [
      "くじレーダーのパスワード再設定のご依頼を受け付けました。",
      "",
      "以下のリンクから、30分以内に新しいパスワードを設定してください。",
      url,
      "",
      "※ このリンクは1回だけ有効です。",
      "※ お心当たりがない場合は、このメールを破棄してください。パスワードは変更されません。",
      "",
      "---",
      "くじレーダー（非公式サービス）",
    ].join("\n"),
  };
}
