/**
 * MapLibre のワーカースクリプトを public/ へ複製する。
 *
 *   npm run maplibre:worker   （build と dev の前に自動実行される）
 *
 * ★ **これが無いと地図に道路も地名も出ない。**
 *   MapLibre はワーカーの場所を `new URL("./maplibre-gl-worker.mjs", import.meta.url)`
 *   で解決する。Turbopack がバンドルすると import.meta.url はチャンクのURLになるため、
 *   `/_next/static/chunks/maplibre-gl-worker.mjs` という存在しない場所を指す。
 *   Next.js が404のHTMLを返し、モジュールワーカーとして読めずに落ちる。
 *
 *   ワーカーが死ぬとベクタータイルの取得も解析も行われず、
 *   **背景色だけが描かれた地図**になる。エラーは
 *   「non-JavaScript MIME type of "text/html"」という、
 *   地図と結びつけにくい文言でしか出ない。
 *
 * ⚠️ ラスタタイル（OSM）はワーカーを使わないため、この不具合は
 *    MapTiler のベクタータイルに切り替えた瞬間にだけ表面化する。
 *
 * ⚠️ 2ファイルとも必要。worker は shared を相対パスで読み込む。
 *
 * node_modules から複製するのは、**バージョンをずらさないため**。
 * 手で置くと maplibre-gl を上げたときに古いワーカーが残る。
 */

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist");
const OUT = path.join(ROOT, "public", "maplibre");

/** setWorkerUrl で指す先。MapView.tsx の WORKER_URL と一致させること */
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(OUT, { recursive: true });
for (const name of FILES) {
  await copyFile(path.join(DIST, name), path.join(OUT, name));
  console.log(`public/maplibre/${name}`);
}
