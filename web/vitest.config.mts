import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// .mts（ESM）なので __dirname は使えない
const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // アプリ側と同じ "@/..." エイリアスを使えるようにする
    alias: { "@": path.join(dir, "src") },
  },
});
