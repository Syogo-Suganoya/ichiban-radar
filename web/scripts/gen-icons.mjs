/**
 * アプリアイコンを1つの意匠から生成する。
 *
 *   npm run icons
 *
 * ★ **正はこのファイルの MARK（SVG）だけ**。書き出し先は触らない。
 *   PNGを個別に差し替えると、サイズごとに違う絵が出回る。
 *
 * 書き出し先と用途:
 *   src/app/icon.svg      … 対応ブラウザのファビコン（拡大しても滲まない）
 *   src/app/favicon.ico   … 旧ブラウザ用。16/32/48px を1ファイルに収める
 *   src/app/apple-icon.png… iOSでホーム画面に追加したときのアイコン
 *   public/icon-192.png   … プッシュ通知の icon / badge（sw.js が参照）
 *   public/icon-512.png   … PWAのインストール時など、大きく出る場面用
 *
 * ⚠️ 文字は font ではなく path で描く。ラスタライズ環境にフォントがあるとは
 *    限らず、あっても字形が変わる。生成のたびに絵が変わるのを避ける。
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 背景。LPの --night に合わせた濃紺 */
const BG = "#141c2e";
/** 「く」。屋号の頭文字をそのまま記号にする */
const MARK_COLOR = "#ffffff";
/** レーダーが拾った1点。地図の「十分（在庫あり）」と同じ緑 */
const BLIP = "#34d399";

/**
 * 64×64 座標系で描く。
 *
 * 「く」は太いシェブロンとして描く。16pxまで縮めても形が潰れず、
 * かつ屋号（くじレーダー）と結びつく。
 * 右上の点は、レーダーが1件拾った状態を表す。
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  <path d="M38 13 L20 32 L38 51"
        fill="none" stroke="${MARK_COLOR}" stroke-width="8"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="47" cy="45" r="6" fill="${BLIP}"/>
</svg>
`;

const png = (size) => sharp(Buffer.from(MARK)).resize(size, size).png().toBuffer();

/**
 * ICOを組み立てる。
 *
 * Vista以降のICOは各エントリにPNGをそのまま入れられるので、
 * ヘッダとディレクトリだけ自前で書けば済む。
 * このためだけに変換用の依存を増やさない。
 */
async function ico(sizes) {
  const images = await Promise.all(sizes.map(png));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 予約領域
  header.writeUInt16LE(1, 2); // 1 = アイコン
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = images.map((image, i) => {
    const entry = Buffer.alloc(16);
    // 256px は 0 で表す仕様。ここでは 48px までなのでそのまま入る
    entry.writeUInt8(sizes[i] % 256, 0);
    entry.writeUInt8(sizes[i] % 256, 1);
    entry.writeUInt8(0, 2); // パレット数（PNGなので0）
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // カラープレーン
    entry.writeUInt16LE(32, 6); // ビット深度
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images]);
}

const OUT = [
  ["src/app/icon.svg", async () => Buffer.from(MARK)],
  ["src/app/favicon.ico", () => ico([16, 32, 48])],
  ["src/app/apple-icon.png", () => png(180)],
  ["public/icon-192.png", () => png(192)],
  ["public/icon-512.png", () => png(512)],
];

for (const [relative, build] of OUT) {
  const file = path.join(ROOT, relative);
  await mkdir(path.dirname(file), { recursive: true });
  const buffer = await build();
  await writeFile(file, buffer);
  console.log(`${relative}  ${buffer.length.toLocaleString()} bytes`);
}
