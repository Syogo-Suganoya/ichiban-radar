import type { StockStatus, TopPrizeState } from "./types";

/**
 * 「品薄」とみなす残り本数の上限。
 *
 * 認定員はステータスを入力せず「残り本数」だけを入力し、
 * ステータスはここから機械的に導出する。
 *
 * 閾値を1箇所に集約しているため、運用しながら基準を変えると
 * 過去の入力を含めて表示が一括で切り替わる。
 */
export const LOW_STOCK_THRESHOLD = 10;

/** 残り本数からステータスを導出する。null は「確認不可」 */
export function deriveStatus(remaining: number | null): StockStatus {
  if (remaining === null) return "UNKNOWN";
  if (remaining <= 0) return "SOLD_OUT";
  if (remaining <= LOW_STOCK_THRESHOLD) return "LOW_STOCK";
  return "IN_STOCK";
}

/**
 * ユーザー報告で選ばせる残り本数の選択肢。
 * 一般ユーザーに正確な本数は数えられないため、バケット化して負担を下げる。
 */
export const REMAINING_BUCKETS: { label: string; value: number | null }[] = [
  { label: "〜5", value: 5 },
  { label: "〜10", value: 10 },
  { label: "〜30", value: 30 },
  { label: "不明", value: null },
];

export const TOP_PRIZE_META: Record<
  TopPrizeState,
  { label: string; short: string; color: string }
> = {
  AVAILABLE: { label: "A賞あり", short: "A賞", color: "#d4a017" },
  GONE: { label: "上位賞なし", short: "—", color: "#9aa0a6" },
  UNKNOWN: { label: "上位賞 不明", short: "?", color: "#c4c8ce" },
};
