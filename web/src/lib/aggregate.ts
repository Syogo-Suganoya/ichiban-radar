/**
 * 在庫シグナルの集計エンジン。
 *
 * ここがサービスの中核ロジック。個々のAI判定を、そのまま地図に出さずに
 * 「クロス検証」と「鮮度減衰」を通してから表示用のシグナルに変換する。
 *
 * 単一の投稿を鵜呑みにしないことが、フェイク情報対策そのものになっている。
 */

import { deriveStatus } from "./stock";
import type {
  AnalyzedPost,
  InventorySignal,
  SourceKind,
  StockStatus,
  TopPrizeState,
  VerifiedReport,
} from "./types";

/** SNS推測の有効期間。これを過ぎたら「情報不足」に落とす（企画書の定義） */
export const FRESH_WINDOW_HOURS = 12;

/** 電話確認（確定情報）の有効期間。発売日は在庫が速く動くため短くとる */
export const VERIFIED_WINDOW_HOURS = 6;

/** これ未満の確信度は表示しない。空振りによる信頼低下を防ぐ */
export const MIN_CONFIDENCE = 0.4;

/** 鮮度窓の終端における確信度の残存率 */
const DECAY_FLOOR = 0.5;

/** 複数投稿が一致したときの加点（1件増えるごと） */
const CROSS_CHECK_BONUS = 0.04;

/** 確信度の上限。推測である以上100%にはしない */
const CONFIDENCE_CEILING = 0.97;

/**
 * 情報源ごとの重み。
 * Instagramはハッシュタグ起点で店舗特定が本文に依存しない分、確度を低く見る。
 */
const SOURCE_WEIGHT: Record<SourceKind, number> = {
  x: 1.0,
  instagram: 0.85,
};

function hoursSince(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / 3_600_000;
}

/** 経過時間に応じて確信度を減衰させる。窓を超えたら null（＝情報として扱わない） */
function decay(confidence: number, ageHours: number, windowHours: number): number | null {
  if (ageHours < 0) return confidence; // 未来日時は減衰させない
  if (ageHours > windowHours) return null;
  const factor = 1 - (ageHours / windowHours) * (1 - DECAY_FLOOR);
  return confidence * factor;
}

/** 上位賞の残存を、確信度の重み付けで集計する（在庫ステータスとは独立の軸） */
function aggregateTopPrize(items: AnalyzedPost[]): TopPrizeState {
  const scores = new Map<TopPrizeState, number>();
  for (const { post, analysis } of items) {
    if (analysis.topPrize === "UNKNOWN") continue;
    const weighted = analysis.confidence * SOURCE_WEIGHT[post.source];
    scores.set(analysis.topPrize, (scores.get(analysis.topPrize) ?? 0) + weighted);
  }
  if (scores.size === 0) return "UNKNOWN";
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

interface AggregateOptions {
  /** 集計の基準時刻。テスト時に固定できるようにしてある */
  now?: number;
}

/**
 * 店舗ごとに在庫シグナルを1件に畳み込む。
 *
 * 優先順位:
 *   1. 鮮度内の電話確認（確定情報）があれば、それを採用して verified を立てる
 *   2. なければSNS推測を確信度で重み付け集計し、最有力のステータスを採る
 */
export function aggregate(
  analyzed: AnalyzedPost[],
  verified: VerifiedReport[],
  titleId: string,
  options: AggregateOptions = {},
): Map<string, InventorySignal> {
  const now = options.now ?? Date.now();
  const result = new Map<string, InventorySignal>();

  // --- 1. 電話確認（確定情報）を最優先で採用 ---
  for (const report of verified) {
    if (report.titleId !== titleId) continue;
    // 「確認不可」は記録としては残るが、在庫情報としては扱わない
    if (report.remaining === null) continue;

    const confidence = decay(1.0, hoursSince(report.checkedAt, now), VERIFIED_WINDOW_HOURS);
    if (confidence === null) continue;

    const existing = result.get(report.storeId);
    if (existing && existing.updatedAt && existing.updatedAt >= report.checkedAt) continue;

    result.set(report.storeId, {
      storeId: report.storeId,
      titleId,
      // 認定員はステータスを入力しない。残り本数から導出する
      status: deriveStatus(report.remaining),
      confidence,
      remaining: report.remaining,
      topPrize: report.topPrize,
      verified: true,
      evidence: [],
      updatedAt: report.checkedAt,
    });
  }

  // --- 2. SNS推測を店舗ごとに束ねる ---
  const byStore = new Map<string, AnalyzedPost[]>();
  for (const item of analyzed) {
    const { analysis } = item;
    if (!analysis.isRelevant || !analysis.storeId) continue;
    if (analysis.titleId !== titleId) continue;
    if (decay(1, hoursSince(item.post.postedAt, now), FRESH_WINDOW_HOURS) === null) continue;

    const list = byStore.get(analysis.storeId) ?? [];
    list.push(item);
    byStore.set(analysis.storeId, list);
  }

  for (const [storeId, items] of byStore) {
    const existing = result.get(storeId);

    // 確定情報がある店舗は在庫ステータスを上書きしない。
    // ただし上位賞が「不明」のままなら、SNS側の情報で補える
    if (existing?.verified) {
      if (existing.topPrize === "UNKNOWN") {
        existing.topPrize = aggregateTopPrize(items);
      }
      continue;
    }

    // ステータスごとに重み付き確信度を合算し、最有力を選ぶ
    const scores = new Map<StockStatus, number>();
    for (const { post, analysis } of items) {
      const weighted = analysis.confidence * SOURCE_WEIGHT[post.source];
      scores.set(analysis.status, (scores.get(analysis.status) ?? 0) + weighted);
    }

    const [status] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
    const agreeing = items.filter((i) => i.analysis.status === status);

    // 単体の最高確信度に、一致件数ぶんのクロス検証ボーナスを加える
    const best = Math.max(
      ...agreeing.map((i) => i.analysis.confidence * SOURCE_WEIGHT[i.post.source]),
    );
    const raw = Math.min(CONFIDENCE_CEILING, best + (agreeing.length - 1) * CROSS_CHECK_BONUS);

    const newest = agreeing.reduce((a, b) => (a.post.postedAt > b.post.postedAt ? a : b));
    const confidence = decay(raw, hoursSince(newest.post.postedAt, now), FRESH_WINDOW_HOURS);
    if (confidence === null || confidence < MIN_CONFIDENCE) continue;

    result.set(storeId, {
      storeId,
      titleId,
      status,
      confidence,
      remaining:
        status === "LOW_STOCK"
          ? (agreeing.find((i) => i.analysis.remainingHint != null)?.analysis.remainingHint ?? null)
          : null,
      // 上位賞は在庫ステータスに一致した投稿だけでなく、全投稿から集計する
      topPrize: aggregateTopPrize(items),
      verified: false,
      evidence: agreeing
        .sort((a, b) => b.analysis.confidence - a.analysis.confidence)
        .map((i) => i.post),
      updatedAt: newest.post.postedAt,
    });
  }

  return result;
}

/** 集計結果に載らなかった店舗を「情報不足」として補う */
export function fillUnknown(
  signals: Map<string, InventorySignal>,
  storeIds: string[],
  titleId: string,
): InventorySignal[] {
  return storeIds.map(
    (storeId) =>
      signals.get(storeId) ?? {
        storeId,
        titleId,
        status: "UNKNOWN" as const,
        confidence: 0,
        remaining: null,
        topPrize: "UNKNOWN" as const,
        verified: false,
        evidence: [],
        updatedAt: null,
      },
  );
}
