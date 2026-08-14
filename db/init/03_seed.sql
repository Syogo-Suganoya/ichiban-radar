-- ⚠️ 自動生成。直接編集しないこと。
-- 正は scripts/data/stores.json。変更後に `python3 scripts/gen_stores.py` を実行する。

INSERT INTO stores (id, name, chain, address, location) VALUES
  ('s01', 'ローソン 渋谷道玄坂店', 'ローソン', '東京都渋谷区道玄坂2-6', ST_SetSRID(ST_MakePoint(139.6976, 35.6584), 4326)::geography),
  ('s02', 'セブン-イレブン 渋谷センター街店', 'セブン-イレブン', '東京都渋谷区宇田川町25', ST_SetSRID(ST_MakePoint(139.6982, 35.6606), 4326)::geography),
  ('s03', 'ファミリーマート 渋谷宮益坂店', 'ファミリーマート', '東京都渋谷区渋谷1-8', ST_SetSRID(ST_MakePoint(139.7051, 35.66), 4326)::geography),
  ('s04', 'ローソン 渋谷桜丘店', 'ローソン', '東京都渋谷区桜丘町14', ST_SetSRID(ST_MakePoint(139.6989, 35.6551), 4326)::geography),
  ('s05', 'セブン-イレブン 渋谷神南店', 'セブン-イレブン', '東京都渋谷区神南1-20', ST_SetSRID(ST_MakePoint(139.6995, 35.664), 4326)::geography),
  ('s06', 'ファミリーマート 渋谷明治通店', 'ファミリーマート', '東京都渋谷区渋谷1-14', ST_SetSRID(ST_MakePoint(139.7038, 35.662), 4326)::geography),
  ('s07', 'ローソン 恵比寿西店', 'ローソン', '東京都渋谷区恵比寿西1-8', ST_SetSRID(ST_MakePoint(139.708, 35.6483), 4326)::geography),
  ('s08', 'セブン-イレブン 代官山店', 'セブン-イレブン', '東京都渋谷区代官山町14', ST_SetSRID(ST_MakePoint(139.6995, 35.6485), 4326)::geography),
  ('s09', 'ファミリーマート 原宿竹下通り店', 'ファミリーマート', '東京都渋谷区神宮前1-17', ST_SetSRID(ST_MakePoint(139.705, 35.6712), 4326)::geography),
  ('s10', 'ローソン 表参道店', 'ローソン', '東京都渋谷区神宮前5-10', ST_SetSRID(ST_MakePoint(139.7085, 35.6665), 4326)::geography),
  ('s11', 'セブン-イレブン 渋谷公園通り店', 'セブン-イレブン', '東京都渋谷区宇田川町15', ST_SetSRID(ST_MakePoint(139.6966, 35.6633), 4326)::geography),
  ('s12', 'ファミリーマート 渋谷南平台店', 'ファミリーマート', '東京都渋谷区南平台町2', ST_SetSRID(ST_MakePoint(139.6944, 35.6555), 4326)::geography),
  ('s13', '書店 渋谷南口店', '書店', '東京都渋谷区渋谷3-27', ST_SetSRID(ST_MakePoint(139.7027, 35.6567), 4326)::geography),
  ('s14', 'ローソン 神泉駅前店', 'ローソン', '東京都渋谷区円山町5', ST_SetSRID(ST_MakePoint(139.6928, 35.6577), 4326)::geography)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, chain = EXCLUDED.chain,
  address = EXCLUDED.address, location = EXCLUDED.location;

INSERT INTO titles (id, name, release_date) VALUES
  ('t01', 'ブレイブスターズ', '2026-08-16'),
  ('t02', 'まほうの街のリリカ', '2026-08-22'),
  ('t03', '剣豪列伝', '2026-09-05')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, release_date = EXCLUDED.release_date;
