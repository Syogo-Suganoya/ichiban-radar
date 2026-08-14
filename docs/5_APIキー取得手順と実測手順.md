# APIキー取得手順と実測手順

作成 2026-08-13
対象スクリプト：[`scripts/`](../scripts/)

このドキュメントは、[4_データ収集実現可能性調査](4_一番くじ在庫マップ_データ収集実現可能性調査.md) で「実測すべき」とした数値を、実際に測るまでの手順書です。

---

## 0. 実測のゴール

| # | 測る数値 | 何が決まるか | スクリプト |
| :-- | :--- | :--- | :--- |
| 1 | Xの該当投稿数（1日あたり／ピーク時） | **全コスト試算の根拠**。資金計画書の予算欄が確定する | `measure_x.py` |
| 2 | `-is:retweet` と状態語ANDの削減率 | クエリ設計の妥当性 | `measure_x.py` |
| 3 | counts エンドポイントの課金有無 | 継続的な件数モニタリングを無償で回せるか | 残高を目視記録 |
| 4 | Instagramのタグ別投稿数 | 補助ソースとしてのカバレッジ | `measure_instagram.py` |
| 5 | **店舗が特定できた投稿の割合** | **サービスが成立するかどうかそのもの** | `analyze_posts.py` |
| 6 | 1投稿あたりの実トークン数・実コスト | 試算値（0.03円）の裏取り | `analyze_posts.py` |

**最優先は #1 と #5** です。この2つが出れば事業計画の数字はほぼ確定します。

---

## 1. X API のキー取得

### 1-1. 開発者アカウントの作成

1. [developer.x.com](https://developer.x.com/) にアクセスし、利用するXアカウントでサインイン
2. 「Sign up for Free Account」→ 開発者規約に同意
3. **利用目的（Use case）の記述**を求められる。日本語不可・英語で250文字以上が目安

> 記述例：
> "We are building a web service that visualizes real-time stock status of 'Ichiban Kuji' (a Japanese character-goods lottery sold at convenience stores) on a map. We analyze public Japanese-language posts mentioning stock conditions (sold out, few remaining, restocked) using an LLM, and plot the inferred status per store. The purpose is to reduce wasted store visits for consumers and to reduce the volume of stock-inquiry phone calls that burden retail staff. We do not redistribute raw post content; we display only aggregated, inferred stock status."

### 1-2. 【必須】支出上限の設定

> ⚠️ **クレジットを購入する前に必ず実施してください。** X APIは2026年2月から従量課金（$0.005/投稿）で、上限を設定しないと費用が青天井になります。

1. Developer Portal → **Billing / Usage**
2. **Spending limit** を設定（実測フェーズは **$20** 程度で十分）
3. **Auto-recharge（自動チャージ）は OFF** にする
4. クレジットを購入（実測用なら $10〜20）

### 1-3. Bearer Token の取得

1. Developer Portal → **Projects & Apps** → アプリを作成（未作成の場合）
2. **Keys and tokens** タブ → **Bearer Token** の「Generate」
3. **表示は一度きり**なのでその場でコピーし、`scripts/.env` の `X_BEARER_TOKEN` に貼る

### 1-4. 残高の記録

Developer Portal の **Usage** 画面で現在のクレジット残高をメモしておきます。`measure_x.py` の実行前後で比較し、**counts エンドポイントに課金があるか**を確定させます（公式ドキュメントに明記がないため、実測で確かめる必要があります）。

---

## 2. Instagram Graph API のキー取得

X と違い**API利用料は無料**ですが、**App Review の承認が必要**で、ここがリードタイム最大の関門です。Phase 1 と並行して最速で着手してください。

### 2-1. 前提となるアカウント整備

1. Instagramアカウントを **ビジネスまたはクリエイターアカウント**に切り替え
   （Instagramアプリ → 設定 → アカウントの種類とツール → プロアカウントに切り替える）
2. **Facebookページ**を作成
3. Instagramアプリ → 設定 → **ページのリンク** から、上記Facebookページと連携

### 2-2. Meta アプリの作成

1. [developers.facebook.com](https://developers.facebook.com/) → **マイアプリ** → **アプリを作成**
2. ユースケースは「**その他**」→ アプリタイプ「**ビジネス**」
3. 作成後、**製品を追加** → **Instagram Graph API**（または Instagram プラットフォーム）を追加

### 2-3. アクセストークンと IG_USER_ID の取得

**Graph API Explorer**（ツール → Graph API Explorer）で以下を順に実行します。

1. アプリを選択し、**権限**に `instagram_basic` `pages_show_list` `pages_read_engagement` を追加
2. 「Generate Access Token」でトークンを発行
3. 連携先のページIDを取得：
   ```
   GET /me/accounts
   ```
4. 上記で得た `{page-id}` からInstagramアカウントIDを取得：
   ```
   GET /{page-id}?fields=instagram_business_account
   ```
   返ってきた `instagram_business_account.id` が **`IG_USER_ID`** です
5. **長期トークンへの交換**（Explorer発行のトークンは1〜2時間で失効します）：
   ```
   GET /oauth/access_token
       ?grant_type=fb_exchange_token
       &client_id={app-id}
       &client_secret={app-secret}
       &fb_exchange_token={短期トークン}
   ```
   得られた約60日有効のトークンを `scripts/.env` の `IG_ACCESS_TOKEN` に設定

### 2-4. 【関門】App Review の申請

ハッシュタグ検索には **`Instagram Public Content Access`** の承認が必要です。

1. アプリダッシュボード → **アプリレビュー** → **権限と機能**
2. `Instagram Public Content Access` を探して「リクエスト」
3. 用途の説明とスクリーンキャスト（実際の利用画面の録画）を提出

> **申請時のポイント**
> Metaが公式に認めている用途は「ハッシュタグキャンペーンに関連するコンテンツの発見」「ブランドに関する世論の把握」等です。
> 「一番くじというキャンペーン商品に関するハッシュタグ投稿を収集し、消費者向けに商品の入手可能性を可視化する」という文脈で、**キャンペーンコンテンツの発見という枠に沿った説明**を組み立ててください。
> 収集したデータを再配布せず、集約・推測した状態表示のみを行うことも明記します。

> ⚠️ **承認が下りるまでの間**、開発モードでは自分が管理者のアカウントに対してのみAPIが叩けます。まずはこの状態で `measure_instagram.py` を回して感触を掴めます。
> また、**不承認でもX単独でサービスは成立する設計**にしてあります（[技術仕様書](2_一番くじ在庫マップ_技術仕様書.md) 1-2）。

### 2-5. 30タグ枠の注意

`ig_hashtag_search` は **7日ローリングで30ユニークタグ**まで。**同一タグの再クエリは枠を追加消費しません**（7日タイマーもリセットされません）。

`measure_instagram.py` は解決済みのタグIDを `scripts/out/ig_hashtag_ids.json` にキャッシュし、無駄な新規解決を防いでいます。**このファイルは消さないでください。**

---

## 3. Gemini API のキー取得

最も簡単です。

1. [aistudio.google.com](https://aistudio.google.com/) にGoogleアカウントでサインイン
2. 左メニュー **Get API key** → **APIキーを作成**
3. `scripts/.env` の `GEMINI_API_KEY` に設定

**モデルIDの確認**：`.env` の `GEMINI_MODEL` は既定で `gemini-3.1-flash-lite` です。AI Studio のモデル一覧で正確なIDを確認し、異なる場合は書き換えてください。

> ⚠️ 最安の `gemini-2.5-flash-lite` は **2026年10月16日に提供終了**のため採用しません。
> 💡 課金を有効化していない無料枠でも実測は可能ですが、レート制限が厳しいため件数が多い場合は有料化を検討してください。

---

## 4. セットアップと実行

### 4-1. セットアップ

Python は Docker で動かします（ホストに環境を作る必要はありません）。

```bash
cp scripts/.env.example scripts/.env && docker compose build scripts
```

`scripts/.env` を開いて、上記で取得したキーを記入します。
以降のコマンドは `docker compose run --rm scripts` を頭に付けて実行してください。

> `.env` と `out/` は `.gitignore` 済みです。**キーを含むファイルは絶対にコミットしないでください。**

### 4-2. Xの件数を実測する（課金は最小）

```bash
docker compose run --rm scripts python measure_x.py
```

4パターンのクエリで直近7日間の件数を比較し、月額・年額のコスト試算まで出力します。

```bash
docker compose run --rm scripts python measure_x.py --hourly
```

時間別の分布を取得します。発売日のピークが何時に立つかが分かり、ポーリング頻度の設計根拠になります。

> **重要**：この計測は直近7日分しか取れません。**大型タイトルの発売日を含む週に必ず再計測**してください。平常週の数値だけで予算を組むと、ピークを見誤ります。

### 4-3. 本文をサンプル取得する（ここから課金）

```bash
docker compose run --rm scripts python measure_x.py --sample 100 --yes
```

100件で約75円です。`--yes` を付けない限り課金は発生せず、見積もりだけ表示されます。

### 4-4. Instagramを実測する（無料）

```bash
docker compose run --rm scripts python measure_instagram.py --tags 一番くじ
```

複数タグを一度に測る場合（**30枠を消費する**点に注意）：

```bash
docker compose run --rm scripts python measure_instagram.py --tags 一番くじ 一番くじ購入 ラストワン賞 --max 300
```

### 4-5. AI解析で抽出率を測る（最重要）

```bash
docker compose run --rm scripts python analyze_posts.py x-sample-20260813-101500.json --source x
```

Instagramは画像内にしか店舗名がないことが多いため、Vision併用との差を比較します：

```bash
docker compose run --rm scripts python analyze_posts.py ig-media-20260813-101500.json --source instagram --vision
```

出力される「**店舗が特定できた**」の割合が、このサービスの成立可否を決める数値です。「上位賞（A賞）の情報あり」の割合も同時に出るので、A賞フィルタが実用に耐えるかもここで判断できます。

### 4-6. 解析バッチを回す（本番パイプラインの原型）

`analyze_posts.py` が抽出率の計測用なのに対し、`pipeline.py` は**Webアプリが読める形式で書き出す本番パイプライン**です。

```bash
docker compose run --rm scripts python pipeline.py --input out/x-sample-20260813-101500.json --source x --title-id t01
```

Geminiを呼ばずに**店舗名の名寄せ精度だけ**を確認することもできます（無料）。

```bash
docker compose run --rm scripts python pipeline.py --input out/x-sample-20260813-101500.json --source x --title-id t01 --dry-run
```

出力される `out/analyzed-t01-*.json` は `web/src/lib/types.ts` の `AnalyzedPost[]` と同じ形式です。Neon実装後は、この内容をそのままDBへ書き込みます。

---

## 5. 実測後にやること

1. 出力された1日平均・ピーク件数を [3_資金計画書](3_一番くじ在庫マップ_事業・資金計画書.md) の 2-1 表に反映し、概算を実測値で置き換える
2. counts エンドポイントの課金有無（残高の差分）を [4_調査](4_一番くじ在庫マップ_データ収集実現可能性調査.md) に追記する
3. 店舗特定率が低い場合、`analyze_posts.py` の `SYSTEM` プロンプトと出力スキーマを調整して再計測する（`out/analysis-*.json` の誤判定を目視で確認するのが近道）
4. 店舗特定率が実用に耐えない水準だった場合は、**電話確認の比重を上げ、監視範囲を絞る方向に計画を修正する**（SNS解析だけで成立させようとしない）

---

## 付録：トラブルシューティング

| 症状 | 原因と対処 |
| :--- | :--- |
| X API が 401 | Bearer Token の誤り。再生成して `.env` を更新 |
| X API が 403 | 該当エンドポイントへのアクセス権がない。Developer Portal でアプリのアクセスレベルを確認 |
| X API が 429 | レート制限。スクリプトが自動で待機・再試行します |
| クエリが512文字超のエラー | 状態語を減らす。**店舗名の列挙は不可能**な点に注意 |
| IG が `(#10) Application does not have permission` | `Instagram Public Content Access` が未承認。開発モードで自分の管理アカウントを対象に実行しているか確認 |
| IG が `(#4) Application request limit reached` | 200 calls/hour/user の上限。1時間待つ |
| IG のハッシュタグが見つからない | 表記ゆれの可能性。`#` は付けずにタグ名のみを渡す |
| IG の取得数が `--max` に張り付く | 上限で頭打ち。`--max` を増やす（無料） |
| Gemini が `model not found` | `.env` の `GEMINI_MODEL` を AI Studio の正確なモデルIDに修正 |
