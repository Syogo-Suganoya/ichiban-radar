import {
  faInstagram,
  faXTwitter,
  type IconDefinition,
} from "@fortawesome/free-brands-svg-icons";

import type { StockStatus } from "./types";

export const STATUS_META: Record<
  StockStatus,
  { label: string; short: string; color: string; bg: string; border: string; text: string }
> = {
  SOLD_OUT: {
    label: "完売",
    short: "完売",
    color: "#e23b3b",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
  },
  LOW_STOCK: {
    label: "品薄",
    short: "品薄",
    color: "#f28c28",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
  },
  IN_STOCK: {
    label: "十分",
    short: "十分",
    color: "#22a45d",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
  },
  UNKNOWN: {
    label: "情報不足",
    short: "?",
    color: "#9aa0a6",
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    text: "text-neutral-500",
  },
};

/**
 * 投稿の出所。
 *
 * `label` はアイコンの代替テキストとして残す（アイコンは aria-hidden なので、
 * 読み上げと「◯件」の文言はこちらが担う）。
 *
 * ⚠️ Xのアイコンは Font Awesome 6.4 以降の `faXTwitter` を使う。
 *    v4/v5 の `faTwitter` は青い鳥のままで、現在のブランドと一致しない。
 */
export const SOURCE_META: Record<
  string,
  { label: string; icon: IconDefinition; badge: string }
> = {
  x: { label: "X", icon: faXTwitter, badge: "bg-neutral-900 text-white" },
  instagram: {
    label: "Instagram",
    icon: faInstagram,
    badge: "bg-gradient-to-br from-amber-500 via-pink-600 to-purple-600 text-white",
  },
};

/** 相対時刻の表示。「10分前」形式 */
export function relativeTime(iso: string | null): string {
  if (!iso) return "情報なし";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
