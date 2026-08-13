-- PostGIS を有効化する。
-- 「現在地から半径N km以内の店舗」を高速に引くために必須
-- （技術仕様書 3章）。
CREATE EXTENSION IF NOT EXISTS postgis;

-- 店舗名の曖昧一致（名寄せ結果の突き合わせ）に使う
CREATE EXTENSION IF NOT EXISTS pg_trgm;
