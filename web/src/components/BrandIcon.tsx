import type { IconDefinition } from "@fortawesome/free-brands-svg-icons";

/**
 * Font Awesome のブランドアイコンを1つ描画する。
 *
 * 公式の React コンポーネント（@fortawesome/react-fontawesome）は
 * fontawesome-svg-core への依存も増えるが、ここで必要なのは
 * XとInstagramの2つだけなので、アイコン定義から直接SVGを組み立てる。
 * アイコンデータ自体は本家パッケージのものをそのまま使う。
 *
 * ⚠️ CDNの `<link>` は使わない。全アイコンぶんのCSSを読み込むことになり、
 *    レンダリングを止めるうえ、2アイコンには釣り合わない。
 */

interface Props {
  icon: IconDefinition;
  /** サイズと色は Tailwind のクラスで指定する（fill は currentColor） */
  className?: string;
}

export default function BrandIcon({ icon, className }: Props) {
  const [width, height, , , path] = icon.icon;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      fill="currentColor"
      // 意味は隣接するテキストが担う。読み上げの重複を避ける
      aria-hidden
      focusable="false"
    >
      {/* 一部のアイコンはパスが複数に分かれている */}
      <path d={Array.isArray(path) ? path.join(" ") : path} />
    </svg>
  );
}
