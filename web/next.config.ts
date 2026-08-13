import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ホームディレクトリの package-lock.json を誤って拾わないようルートを固定する
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
