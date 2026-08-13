# web — くじレーダー フロントエンド

Next.js 16（App Router）+ MapLibre GL JS + Tailwind CSS 4。

関連ドキュメント：[技術仕様書](../docs/2_一番くじ在庫マップ_技術仕様書.md)／[実測手順](../docs/5_APIキー取得手順と実測手順.md)

## 起動

```bash
cd web && npm install && cp .env.example .env.local && npm run dev
```

| URL | 画面 |
| :--- | :--- |
| http://localhost:3000 | 一般ユーザー向けマップ（渋谷エリアのモックデータ・ログイン任意） |
| http://localhost:3000/lp | サービス紹介LP |
| http://localhost:3000/admin | 在庫確認コンソール（業務用・**要ログイン**） |

## 現在の状態

**X API / Instagram の承認待ちのため、データはすべてモックです。** ヘッダーの「モックデータ」バッジで判別できます。

集計ロジック（`src/lib/aggregate.ts`）と画面は**本番想定の実装**であり、入力データだけがモックに差し替わっている状態です。

## アーキテクチャ

図はリポジトリルートの [README](../README.md#アーキテクチャ) を参照してください。

```
[X API] [IG Graph API] → [Gemini解析バッチ] → [Supabase] → DataSource → aggregate() → API Route → UI
```

UIはSNSのAPIを直接呼ばず、**常に「解析済みの結果」だけを見る**。この分離により、収集基盤の実装が終わるまでフロントを完成させられます。

## 実データへの差し替え手順

1. `src/lib/data/supabase.ts` の `SupabaseDataSource` を実装する
2. `.env.local` に `DATA_SOURCE=supabase` と Supabase の接続情報を設定する

`DataSource` interface（`src/lib/data/source.ts`）を満たしていれば、**UI側の変更は不要**です。

## 主要ファイル

| パス | 役割 |
| :--- | :--- |
| `src/lib/types.ts` | ドメイン型。`Analysis` は `scripts/schema.py` の Pydantic モデルと1:1で対応させること |
| `src/lib/aggregate.ts` | **中核ロジック**。クロス検証・鮮度減衰・表示閾値 |
| `src/lib/data/mock.ts` | モックデータ（★差し替え対象） |
| `src/lib/data/supabase.ts` | 実データ実装（未実装） |
| `src/components/MapView.tsx` | MapLibre の地図描画とピン |
| `src/lib/signals.ts` | 収集〜集計の唯一の入口。画面・API・通知判定がすべてここを通る |
| `src/components/StoreSheet.tsx` | 店舗詳細。判定根拠の開示と免責 |
| `src/lib/stock.ts` | 残り本数 → ステータスの導出。閾値の唯一の定義箇所 |
| `src/components/admin/OperatorConsole.tsx` | 在庫確認コンソール。一般画面とは意図的に別デザイン |
| `src/app/lp/page.tsx` | サービス紹介LP |
| `src/app/api/signals/route.ts` | タイトル切り替え時の集計API |
| `src/app/api/admin/reports/route.ts` | オペレーター入力の保存・取得 |
| `src/lib/auth.ts` | 認証（scrypt + 署名Cookie）。一般/管理でセッションを分離 |
| `src/components/AuthSheet.tsx` | プレミアムプランの入口（一般ユーザーの登録・ログイン） |
| `src/lib/push.ts` | Web Push 送信と「急変」判定 |
| `src/app/api/auth/route.ts` | 一般ユーザーの登録・ログイン |
| `src/app/api/favorites/route.ts` | お気に入り（要ログイン） |
| `src/app/api/push/subscribe/route.ts` | プッシュ購読（要ログイン） |
| `src/app/api/admin/auth/route.ts` | 管理画面の登録・ログイン |
| `public/sw.js` | プッシュ受信のサービスワーカー |

## 認証

**一般ユーザーと管理画面でセッションを完全に分けています**（`src/lib/auth.ts`）。Cookie名も署名の名前空間も別なので、一般ユーザーのセッションで管理APIを叩くことはできません。

| | 一般ユーザー | 管理画面 |
| :--- | :--- | :--- |
| ログイン | **任意**（未ログインでも地図は使える） | 必須 |
| 入口 | ヘッダーの「有料プラン」 | `/admin/login` |
| Cookie | `kuji_user_session`（30日） | `kuji_admin_session`（12時間） |
| 招待コード | なし | `ADMIN_SIGNUP_CODE` を設定すると必須 |

- パスワードは scrypt でハッシュ化。セッションは HMAC 署名付きの httpOnly Cookie
- **オペレーターIDはリクエストボディではなくセッションから取る**。他人のIDで入力できると入力ログの追跡可能性が崩れるため
- `AUTH_SECRET` 未設定だと開発サーバー再起動でログインが切れる

## プッシュ通知

プレミアムプランの主価値です（[収益計画書](../docs/6_一番くじ在庫マップ_収益計画書.md)）。**ログインしてお気に入り登録したユーザー**にだけ届きます。

```bash
cd web && npm run push:keys
```

出力された鍵を `.env.local` の `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` に設定します。**未設定でもアプリは動作し、通知機能だけが無効になります。**

通知するのは次の3つだけです。**通知を出しすぎると即座に解約されるため、「行動が変わる変化」に絞っています。**

1. 在庫あり → 品薄
2. → 完売
3. 上位賞あり → 上位賞なし

## 集計ロジックの要点（`src/lib/aggregate.ts`）

単一の投稿を鵜呑みにしないことが、そのままフェイク情報対策になっています。

- **クロス検証**：同一店舗の複数投稿が一致するほど確信度が上がる（1件ごとに +0.04、上限0.97）
- **鮮度減衰**：SNS推測は12時間、電話確認は6時間で失効。経過に応じて確信度が下がる
- **表示閾値**：確信度0.4未満は表示しない（空振りによる信頼低下を防ぐ）
- **情報源の重み**：Instagram は店舗特定が弱いため 0.85 倍
- **確定情報の優先**：鮮度内の電話確認があれば、SNS推測より優先する
- **上位賞は独立軸**：A賞の残存は在庫数とは別に集計する。「くじは残っているが上位賞は無い」は頻出で、上位賞狙いのユーザーには残数より重要


## 未実装（今後）

- Supabase 実装（`src/lib/data/supabase.ts`）。認証も Supabase Auth へ移せる
- 現在地からの距離表示（PostGIS の `ST_DWithin` 導入後）
- パスワード再設定

> ⚠️ モックの入力データとアカウントはメモリ上に保持しているため、**開発サーバーを再起動すると消えます**。Supabase実装までの暫定措置です。
> なお開発サーバーでは Route Handler と Server Component がモジュールを別インスタンスとして読み込むことがあるため、
> これらのストアは `globalThis` に載せています（載せないと書き込みが画面に反映されません）。
