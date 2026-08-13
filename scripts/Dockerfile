# 実測・解析スクリプトの実行環境。
#
# ローカルの Python 3.9 と揃えている。バージョンを上げるときは
# scripts/schema.py の Optional[] 制約（CONTRIBUTING.md 不変条件①）も
# 合わせて見直すこと。
FROM python:3.9-slim

WORKDIR /app

# 依存だけ先に入れてレイヤーキャッシュを効かせる
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 出力先。docker-compose で host にマウントする
ENV PYTHONUNBUFFERED=1

# 既定では何もせず待機する。実行は `docker compose run scripts python measure_x.py` の形
CMD ["python", "-c", "print('scripts コンテナです。docker compose run --rm scripts python measure_x.py のように実行してください')"]
