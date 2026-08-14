-- くじレーダーのスキーマ。
--
-- ローカル（docker compose up -d db）では 01_extensions.sql の直後に自動実行される。
-- Neon では SQL Editor にこのファイルの内容を貼って実行する。
--
-- ⚠️ 拡張（postgis / pg_trgm）が先に必要。01_extensions.sql を先に流すこと。

-- ---------------------------------------------------------------- マスター

CREATE TABLE IF NOT EXISTS stores (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  chain       text NOT NULL,
  address     text NOT NULL,
  -- 緯度経度を別カラムで持たず geography に寄せる。
  -- 「現在地から半径N km」を ST_DWithin で引くのが主用途で、
  -- geography なら距離をメートルで直接指定できる（球面計算）
  location    geography(Point, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 近傍検索用。これが無いと店舗が増えたとき全件走査になる
CREATE INDEX IF NOT EXISTS stores_location_idx ON stores USING GIST (location);

-- 店舗名の曖昧一致（名寄せ結果の突き合わせ）用
CREATE INDEX IF NOT EXISTS stores_name_trgm_idx ON stores USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS titles (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  release_date date NOT NULL
);

-- ---------------------------------------------------------------- 利用者

CREATE TABLE IF NOT EXISTS users (
  id                 text PRIMARY KEY,
  email              text NOT NULL UNIQUE,
  display_name       text NOT NULL,
  -- scrypt の "salt:hash"。平文は保存しない
  password_hash      text NOT NULL,
  premium_until      timestamptz,
  stripe_customer_id text UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Webhook が顧客IDから利用者を引くため
CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users (stripe_customer_id);

-- 管理画面のオペレーター。users とは意図的に別テーブル。
-- セッションを分ける設計（CONTRIBUTING 不変条件⑥c）と揃える
CREATE TABLE IF NOT EXISTS operators (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  store_id   text NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   text PRIMARY KEY,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

-- ---------------------------------------------------------------- 収集・解析

-- SNS投稿の生データ。解析結果とは分けて保持する。
-- プロンプトやモデルを変えて再解析するとき、投稿を取り直さずに済む
-- （X APIは1件読むごとに課金されるため、取り直しは実費になる）
CREATE TABLE IF NOT EXISTS posts_raw (
  id         text PRIMARY KEY,
  source     text NOT NULL CHECK (source IN ('x', 'instagram')),
  text       text NOT NULL,
  permalink  text,
  image_url  text,
  posted_at  timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_raw_posted_at_idx ON posts_raw (posted_at DESC);

-- AI解析の結果。集計はここではなく lib/aggregate.ts が行う。
-- 判定ロジックを1箇所に保つため、DBには「素の判定」だけを置く
CREATE TABLE IF NOT EXISTS analyzed_posts (
  post_id        text PRIMARY KEY REFERENCES posts_raw (id) ON DELETE CASCADE,
  is_relevant    boolean NOT NULL,
  store_id       text REFERENCES stores (id) ON DELETE SET NULL,
  store_hint     text,
  area_hint      text,
  title_id       text REFERENCES titles (id) ON DELETE SET NULL,
  status         text NOT NULL CHECK (status IN ('SOLD_OUT', 'LOW_STOCK', 'IN_STOCK', 'UNKNOWN')),
  remaining_hint integer,
  top_prize      text NOT NULL CHECK (top_prize IN ('AVAILABLE', 'GONE', 'UNKNOWN')),
  confidence     real NOT NULL,
  reason         text NOT NULL,
  analyzed_at    timestamptz NOT NULL DEFAULT now()
);

-- 「このタイトルの、店舗が特定できた投稿」を引くのが主クエリ
CREATE INDEX IF NOT EXISTS analyzed_posts_title_store_idx
  ON analyzed_posts (title_id, store_id);

-- ---------------------------------------------------------------- 電話確認

-- オペレーターが入力した確定情報。
-- ⚠️ ステータス列は持たない。残り本数から lib/stock.ts が導出する
--   （CONTRIBUTING 不変条件②）。ここに status を足すと閾値変更が
--   過去データに反映されなくなる
CREATE TABLE IF NOT EXISTS verified_reports (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  title_id    text NOT NULL REFERENCES titles (id) ON DELETE CASCADE,
  -- null は「確認不可（不在・つながらず）」。0（完売）とは意味が違う
  remaining   integer,
  top_prize   text NOT NULL CHECK (top_prize IN ('AVAILABLE', 'GONE', 'UNKNOWN')),
  -- 入力を個人に紐づけて追跡可能にする（不変条件⑦）
  operator_id text NOT NULL REFERENCES operators (id),
  checked_at  timestamptz NOT NULL DEFAULT now()
);

-- 同一店舗・同一タイトルは最新1件だけを見るので、その並びで引けるように
CREATE INDEX IF NOT EXISTS verified_reports_lookup_idx
  ON verified_reports (title_id, store_id, checked_at DESC);
