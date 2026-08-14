import { describe, expect, it } from "vitest";

import {
  aggregate,
  fillUnknown,
  FRESH_WINDOW_HOURS,
  MIN_CONFIDENCE,
  VERIFIED_WINDOW_HOURS,
} from "./aggregate";
import type { AnalyzedPost, SourceKind, StockStatus, TopPrizeState, VerifiedReport } from "./types";

/**
 * 集計エンジンのテスト。
 *
 * ★ ここが**壊れても画面上は気づけない**唯一の場所なので、テストで固定する。
 *   確信度が 0.79 から 0.85 に変わってもUIは何事もなく表示されるが、
 *   「複数投稿が一致するほど確信度が上がる」という信頼性の根拠が崩れる。
 *
 * 基準時刻は options.now で固定する。実時刻に依存させると、
 * 鮮度減衰のテストが実行タイミングで揺れる。
 */

const NOW = Date.parse("2026-08-14T12:00:00.000Z");
const TITLE = "t01";

/** NOW から指定時間前のISO文字列 */
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function post(
  id: string,
  storeId: string,
  status: StockStatus,
  confidence: number,
  opts: {
    ageHours?: number;
    source?: SourceKind;
    topPrize?: TopPrizeState;
    remainingHint?: number | null;
    titleId?: string | null;
    isRelevant?: boolean;
  } = {},
): AnalyzedPost {
  return {
    post: {
      id,
      source: opts.source ?? "x",
      text: `${id} の本文`,
      postedAt: hoursAgo(opts.ageHours ?? 1),
    },
    analysis: {
      isRelevant: opts.isRelevant ?? true,
      storeId,
      storeHint: null,
      areaHint: null,
      titleId: opts.titleId === undefined ? TITLE : opts.titleId,
      status,
      remainingHint: opts.remainingHint ?? null,
      topPrize: opts.topPrize ?? "UNKNOWN",
      confidence,
      reason: "テスト",
    },
  };
}

function report(
  storeId: string,
  remaining: number | null,
  opts: { ageHours?: number; topPrize?: TopPrizeState; titleId?: string } = {},
): VerifiedReport {
  return {
    id: `VR-${storeId}`,
    storeId,
    titleId: opts.titleId ?? TITLE,
    remaining,
    topPrize: opts.topPrize ?? "UNKNOWN",
    operatorId: "OP-1",
    checkedAt: hoursAgo(opts.ageHours ?? 1),
  };
}

const run = (a: AnalyzedPost[], v: VerifiedReport[] = []) => aggregate(a, v, TITLE, { now: NOW });

// ---------------------------------------------------------------- 基本

describe("aggregate: 基本の絞り込み", () => {
  it("別タイトルの投稿は混ざらない", () => {
    expect(run([post("p1", "s01", "SOLD_OUT", 0.9, { titleId: "t99" })]).size).toBe(0);
  });

  it("在庫と無関係な投稿（買取告知など）は無視する", () => {
    expect(run([post("p1", "s01", "SOLD_OUT", 0.9, { isRelevant: false })]).size).toBe(0);
  });

  it("店舗が特定できない投稿は地図に出せないので落とす", () => {
    const orphan = post("p1", "s01", "SOLD_OUT", 0.9);
    orphan.analysis.storeId = null;
    expect(run([orphan]).size).toBe(0);
  });

  it("確信度が閾値未満なら表示しない（空振りを防ぐため）", () => {
    // 減衰前から MIN_CONFIDENCE 未満
    expect(run([post("p1", "s01", "SOLD_OUT", MIN_CONFIDENCE - 0.05)]).size).toBe(0);
  });
});

// ---------------------------------------------------------------- 鮮度減衰

describe("aggregate: 鮮度減衰", () => {
  it("鮮度窓を1秒でも超えた投稿は情報として扱わない", () => {
    expect(run([post("p1", "s01", "SOLD_OUT", 0.95, { ageHours: FRESH_WINDOW_HOURS + 0.01 })]).size)
      .toBe(0);
  });

  it("古い投稿ほど確信度が下がる", () => {
    const fresh = run([post("p1", "s01", "SOLD_OUT", 0.9, { ageHours: 0 })]).get("s01")!;
    const stale = run([post("p1", "s01", "SOLD_OUT", 0.9, { ageHours: 6 })]).get("s01")!;

    expect(fresh.confidence).toBeGreaterThan(stale.confidence);
    // 窓の半分で、残存率は 1.0 → 0.75（DECAY_FLOOR=0.5 への線形補間）
    expect(stale.confidence).toBeCloseTo(0.9 * 0.75, 5);
  });

  it("未来日時の投稿は減衰させない（時刻ずれで消えないように）", () => {
    const signal = run([post("p1", "s01", "SOLD_OUT", 0.9, { ageHours: -1 })]).get("s01")!;
    expect(signal.confidence).toBeCloseTo(0.9, 5);
  });
});

// ---------------------------------------------------------------- クロス検証

describe("aggregate: クロス検証", () => {
  it("同じ判定の投稿が増えるほど確信度が上がる", () => {
    const one = run([post("p1", "s01", "SOLD_OUT", 0.8, { ageHours: 0 })]).get("s01")!;
    const three = run([
      post("p1", "s01", "SOLD_OUT", 0.8, { ageHours: 0 }),
      post("p2", "s01", "SOLD_OUT", 0.7, { ageHours: 0 }),
      post("p3", "s01", "SOLD_OUT", 0.6, { ageHours: 0 }),
    ]).get("s01")!;

    expect(three.confidence).toBeGreaterThan(one.confidence);
    // 最高値 0.8 + 一致2件ぶんのボーナス(0.04×2)
    expect(three.confidence).toBeCloseTo(0.88, 5);
    expect(three.evidence).toHaveLength(3);
  });

  it("確信度は100%にならない（推測である以上、断定しない）", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      post(`p${i}`, "s01", "SOLD_OUT", 0.95, { ageHours: 0 }),
    );
    expect(run(many).get("s01")!.confidence).toBeLessThanOrEqual(0.97);
  });

  it("判定が割れたら、重み付き合計が大きい側を採る", () => {
    const signal = run([
      post("p1", "s01", "IN_STOCK", 0.9, { ageHours: 0 }),
      post("p2", "s01", "SOLD_OUT", 0.5, { ageHours: 0 }),
      post("p3", "s01", "SOLD_OUT", 0.5, { ageHours: 0 }),
    ]).get("s01")!;

    // SOLD_OUT が 0.5+0.5=1.0 で IN_STOCK の 0.9 を上回る
    expect(signal.status).toBe("SOLD_OUT");
    // 根拠として出すのは、採用した判定に一致した投稿だけ
    expect(signal.evidence.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("Instagram は X より低く重み付けされる", () => {
    const x = run([post("p1", "s01", "SOLD_OUT", 0.8, { ageHours: 0, source: "x" })]).get("s01")!;
    const ig = run([
      post("p1", "s01", "SOLD_OUT", 0.8, { ageHours: 0, source: "instagram" }),
    ]).get("s01")!;

    expect(ig.confidence).toBeLessThan(x.confidence);
    expect(ig.confidence).toBeCloseTo(0.8 * 0.85, 5);
  });
});

// ---------------------------------------------------------------- 電話確認

describe("aggregate: 電話確認（確定情報）", () => {
  it("電話確認はSNS推測を上書きする", () => {
    const signals = run(
      [post("p1", "s01", "IN_STOCK", 0.95, { ageHours: 0 })],
      [report("s01", 3)],
    );
    const s = signals.get("s01")!;

    expect(s.verified).toBe(true);
    // 残り3枚 → 品薄。オペレーターはステータスを入力しない
    expect(s.status).toBe("LOW_STOCK");
    expect(s.remaining).toBe(3);
  });

  it("残り本数からステータスを導出する（0なら完売）", () => {
    expect(run([], [report("s01", 0)]).get("s01")!.status).toBe("SOLD_OUT");
    expect(run([], [report("s02", 50)]).get("s02")!.status).toBe("IN_STOCK");
  });

  it("「確認不可」(null) は在庫情報として扱わない", () => {
    expect(run([], [report("s01", null)]).size).toBe(0);
  });

  it("電話確認の鮮度窓はSNSより短い", () => {
    expect(run([], [report("s01", 3, { ageHours: VERIFIED_WINDOW_HOURS + 0.01 })]).size).toBe(0);
    // SNSなら生き残る古さでも、電話確認は失効する
    expect(VERIFIED_WINDOW_HOURS).toBeLessThan(FRESH_WINDOW_HOURS);
  });

  it("失効した電話確認があっても、SNS推測は生きる", () => {
    const s = run(
      [post("p1", "s01", "IN_STOCK", 0.9, { ageHours: 0 })],
      [report("s01", 0, { ageHours: VERIFIED_WINDOW_HOURS + 1 })],
    ).get("s01")!;

    expect(s.verified).toBe(false);
    expect(s.status).toBe("IN_STOCK");
  });

  it("同じ店舗に複数の確認があれば新しい方を採る", () => {
    const s = run([], [report("s01", 0, { ageHours: 3 }), report("s01", 20, { ageHours: 1 })])
      .get("s01")!;
    expect(s.remaining).toBe(20);
  });
});

// ---------------------------------------------------------------- 上位賞

describe("aggregate: 上位賞は在庫とは独立した軸", () => {
  it("在庫判定に一致しなかった投稿からも上位賞を拾う", () => {
    const s = run([
      post("p1", "s01", "IN_STOCK", 0.9, { ageHours: 0 }),
      // 判定は採用されないが、上位賞の情報は活かす
      post("p2", "s01", "SOLD_OUT", 0.5, { ageHours: 0, topPrize: "GONE" }),
    ]).get("s01")!;

    expect(s.status).toBe("IN_STOCK");
    expect(s.topPrize).toBe("GONE");
  });

  it("言及が無ければ UNKNOWN のまま（推測で埋めない）", () => {
    expect(run([post("p1", "s01", "IN_STOCK", 0.9)]).get("s01")!.topPrize).toBe("UNKNOWN");
  });

  it("電話確認で上位賞が不明なら、SNS側の情報で補える", () => {
    const s = run(
      [post("p1", "s01", "IN_STOCK", 0.9, { ageHours: 0, topPrize: "AVAILABLE" })],
      [report("s01", 5, { topPrize: "UNKNOWN" })],
    ).get("s01")!;

    expect(s.verified).toBe(true);
    expect(s.topPrize).toBe("AVAILABLE");
  });

  it("電話確認で上位賞が確定していれば、SNSで上書きしない", () => {
    const s = run(
      [post("p1", "s01", "IN_STOCK", 0.9, { ageHours: 0, topPrize: "AVAILABLE" })],
      [report("s01", 5, { topPrize: "GONE" })],
    ).get("s01")!;

    expect(s.topPrize).toBe("GONE");
  });
});

// ---------------------------------------------------------------- 残り本数

describe("aggregate: 残り本数", () => {
  it("品薄のときだけSNSの残り本数を表示する", () => {
    const low = run([
      post("p1", "s01", "LOW_STOCK", 0.9, { ageHours: 0, remainingHint: 3 }),
    ]).get("s01")!;
    expect(low.remaining).toBe(3);

    // 「十分」で具体数を出すと、その後の変動で外れやすい
    const inStock = run([
      post("p2", "s02", "IN_STOCK", 0.9, { ageHours: 0, remainingHint: 80 }),
    ]).get("s02")!;
    expect(inStock.remaining).toBeNull();
  });
});

// ---------------------------------------------------------------- fillUnknown

describe("fillUnknown", () => {
  it("判定が無い店舗を「情報不足」で埋め、店舗の並び順を保つ", () => {
    const signals = run([post("p1", "s02", "SOLD_OUT", 0.9, { ageHours: 0 })]);
    const filled = fillUnknown(signals, ["s01", "s02", "s03"], TITLE);

    expect(filled.map((s) => s.storeId)).toEqual(["s01", "s02", "s03"]);
    expect(filled[0].status).toBe("UNKNOWN");
    expect(filled[0].updatedAt).toBeNull();
    expect(filled[1].status).toBe("SOLD_OUT");
  });
});
