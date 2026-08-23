import { describe, expect, it } from "vitest";

import { rebaseToNow } from "./demo-freshness";
import type { AnalyzedPost, VerifiedReport } from "./types";

/**
 * ★ ここが壊れると**デモが黙って全部「情報不足」になる**。
 *   画面はエラーを出さずグレーのピンを並べるだけなので、
 *   見た人には「情報が無いサービス」に見える。
 */

const iso = (ms: number) => new Date(ms).toISOString();

function post(postedAt: string): AnalyzedPost {
  return {
    post: { id: postedAt, source: "x", text: "残り3枚", postedAt },
    analysis: {
      isRelevant: true,
      storeId: "s01",
      storeHint: null,
      areaHint: null,
      titleId: "t01",
      status: "LOW_STOCK",
      remainingHint: 3,
      topPrize: "UNKNOWN",
      confidence: 0.5,
      reason: "test",
    },
  };
}

function report(checkedAt: string): VerifiedReport {
  return {
    id: checkedAt,
    storeId: "s01",
    titleId: "t01",
    remaining: 5,
    topPrize: "AVAILABLE",
    operatorId: "op1",
    checkedAt,
  };
}

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const HOUR = 3_600_000;

describe("rebaseToNow", () => {
  it("いちばん新しい記録を10分前に寄せる", () => {
    const { analyzed } = rebaseToNow([post(iso(NOW - 100 * HOUR))], [], NOW);
    expect(analyzed[0].post.postedAt).toBe(iso(NOW - 10 * 60_000));
  });

  it("記録どうしの間隔を保つ", () => {
    // 確信度は「近い時刻の投稿がどれだけ一致しているか」で決まるため、
    // 間隔を潰すと集計結果がデモと本番でずれる
    const { analyzed } = rebaseToNow(
      [post(iso(NOW - 100 * HOUR)), post(iso(NOW - 102 * HOUR))],
      [],
      NOW,
    );
    const [a, b] = analyzed.map((x) => new Date(x.post.postedAt).getTime());
    expect(a - b).toBe(2 * HOUR);
  });

  it("投稿と電話確認を同じ量だけずらす", () => {
    // 別々にずらすと前後関係が入れ替わり、
    // 「古い電話確認が新しい投稿を上書きする」状態になりうる
    const { analyzed, verified } = rebaseToNow(
      [post(iso(NOW - 100 * HOUR))],
      [report(iso(NOW - 101 * HOUR))],
      NOW,
    );
    const p = new Date(analyzed[0].post.postedAt).getTime();
    const v = new Date(verified[0].checkedAt).getTime();
    expect(p - v).toBe(HOUR);
    expect(p).toBe(NOW - 10 * 60_000);
  });

  it("失効しない新しさになる", () => {
    // 12時間（SNS）・6時間（電話確認）の窓に確実に収まること
    const { analyzed, verified } = rebaseToNow(
      [post(iso(NOW - 500 * HOUR))],
      [report(iso(NOW - 500 * HOUR))],
      NOW,
    );
    expect(NOW - new Date(analyzed[0].post.postedAt).getTime()).toBeLessThan(6 * HOUR);
    expect(NOW - new Date(verified[0].checkedAt).getTime()).toBeLessThan(6 * HOUR);
  });

  it("既に新しい記録は動かさない", () => {
    // 実データの入った環境で DEMO_MODE を付けたままにしても、
    // 日時を書き換えない
    const fresh = iso(NOW - 60_000);
    const { analyzed } = rebaseToNow([post(fresh)], [], NOW);
    expect(analyzed[0].post.postedAt).toBe(fresh);
  });

  it("未来にはずらさない", () => {
    const future = iso(NOW + 50 * HOUR);
    const { analyzed } = rebaseToNow([post(future)], [], NOW);
    expect(analyzed[0].post.postedAt).toBe(future);
  });

  it("空でも落ちない", () => {
    expect(rebaseToNow([], [], NOW)).toEqual({ analyzed: [], verified: [] });
  });

  it("元の配列を書き換えない", () => {
    const original = post(iso(NOW - 100 * HOUR));
    const before = original.post.postedAt;
    rebaseToNow([original], [], NOW);
    expect(original.post.postedAt).toBe(before);
  });
});
