import type { AnalyzedPost, VerifiedReport } from "./types";

/**
 * デモ表示のとき、投稿と電話確認の日時を「いま」を基準にずらす。
 *
 * ★ **デモを見せるたびにデータを入れ直さなくて済むようにするための処理。**
 *   集計はSNS推測を12時間、電話確認を6時間で失効させるため（aggregate.ts）、
 *   サンプルデータは半日で全部「情報不足」に落ちる。
 *   放置したデモは、翌日にはグレーのピンが並ぶだけの画面になる。
 *
 * ★ **間隔は保ち、全体を平行移動する。**
 *   いちばん新しい記録が LATEST_MINUTES 前に来るよう、全件を同じ量だけずらす。
 *   個別に「いま」へ寄せると、投稿どうしの時間差が消えて確信度の計算が変わる。
 *   投稿と電話確認の前後関係も崩れ、「電話確認のほうが古いのに優先される」
 *   といった、集計の説明がつかない状態になる。
 *
 * ⚠️ **実データには絶対に使わないこと。** これは投稿日時の偽装であり、
 *   本物の在庫情報に適用すれば「12時間で失効させる」という前提そのものが壊れる。
 *   呼び出しは isDemoMode() の中だけ（signals.ts）。
 *
 * ⚠️ 未来にはずらさない。元データが未来の日時を含んでいても、
 *   いちばん新しい記録が「いま」より後になることはない。
 */

/** いちばん新しい記録を、何分前として見せるか */
const LATEST_MINUTES = 10;

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function shifted(iso: string, deltaMs: number): string {
  return new Date(toMs(iso) + deltaMs).toISOString();
}

export function rebaseToNow(
  analyzed: AnalyzedPost[],
  verified: VerifiedReport[],
  now: number = Date.now(),
): { analyzed: AnalyzedPost[]; verified: VerifiedReport[] } {
  const stamps = [
    ...analyzed.map((a) => toMs(a.post.postedAt)),
    ...verified.map((v) => toMs(v.checkedAt)),
  ].filter((ms) => Number.isFinite(ms));

  if (stamps.length === 0) return { analyzed, verified };

  const delta = now - LATEST_MINUTES * 60_000 - Math.max(...stamps);

  // 既に十分新しいなら触らない。実データが入っている環境で
  // DEMO_MODE を付けたままにしても、日時を動かさずに済ませる
  if (delta <= 0) return { analyzed, verified };

  return {
    analyzed: analyzed.map((a) => ({
      ...a,
      post: { ...a.post, postedAt: shifted(a.post.postedAt, delta) },
    })),
    verified: verified.map((v) => ({ ...v, checkedAt: shifted(v.checkedAt, delta) })),
  };
}
