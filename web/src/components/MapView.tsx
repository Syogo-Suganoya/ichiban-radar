"use client";

import { useEffect, useRef } from "react";
import {
  GeolocateControl,
  Map as MlMap,
  Marker,
  NavigationControl,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { STATUS_META } from "@/lib/status";
import type { InventorySignal, Store } from "@/lib/types";

const SHIBUYA: [number, number] = [139.7016, 35.658];

/**
 * 地図スタイル。
 *
 * MapTilerのキーがあればベクタータイルを使い、無ければOSMのラスタにフォールバックする。
 *
 * ⚠️ OSM公式タイル（tile.openstreetmap.org）は寄付で運営される無保証のサービス。
 *    禁止されているのは「商用利用」ではなく**重い利用**で、規模が小さいうちは
 *    ポリシーの範囲内にある。ただし提供はbest-effortで、
 *    **予告なくブロックされても文句は言えない**。
 *
 *    在庫マップにとって地図が出ないことは致命的なので、公開して
 *    アクセスが読めなくなる前に NEXT_PUBLIC_MAPTILER_KEY を設定すること。
 *    規約違反を避けるためではなく、ある朝いきなり壊れるのを避けるため。
 */
function buildStyle(): string | StyleSpecification {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (key) return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;

  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

/** ピンのDOM要素を組み立てる */
function buildPin(store: Store, signal: InventorySignal, selected: boolean): HTMLElement {
  const meta = STATUS_META[signal.status];
  const label =
    signal.status === "LOW_STOCK" && signal.remaining != null
      ? `残り${signal.remaining}枚`
      : meta.label;

  const el = document.createElement("div");
  el.className = "relative flex cursor-pointer flex-col items-center";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${store.name} ${label}`);

  const dot = document.createElement("div");
  dot.style.cssText = `
    width:${selected ? 34 : 28}px;height:${selected ? 34 : 28}px;
    background:${meta.color};
    border:${signal.verified ? "3.5px solid #7b52d3" : "2.5px solid #fff"};
    border-radius:50% 50% 50% 4px;transform:rotate(45deg);
    box-shadow:${signal.verified ? "0 0 0 2px rgba(123,82,211,.28)," : ""}0 3px 8px rgba(0,0,0,.3);
    transition:width .12s,height .12s;
  `;
  el.appendChild(dot);

  // 上位賞が残っている店舗は、在庫の色とは別軸で一目でわかるようにする
  if (signal.topPrize === "AVAILABLE") {
    const crown = document.createElement("div");
    crown.textContent = "🏆";
    crown.style.cssText = `
      position:absolute;margin-top:-14px;margin-left:${selected ? 20 : 16}px;
      font-size:13px;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,.4);
    `;
    el.appendChild(crown);
  }

  // 情報不足の店舗はラベルを出さない（画面が文字で埋まるため）
  if (signal.status !== "UNKNOWN") {
    const tag = document.createElement("div");
    tag.textContent = signal.verified ? `✓ ${label}` : label;
    tag.style.cssText = `
      margin-top:4px;background:#fff;border-radius:5px;padding:1px 6px;
      font-size:10px;font-weight:700;white-space:nowrap;
      color:${signal.verified ? "#7b52d3" : "#1a1d21"};
      box-shadow:0 1px 4px rgba(0,0,0,.2);
    `;
    el.appendChild(tag);
  }

  return el;
}

interface Props {
  stores: Store[];
  signals: InventorySignal[];
  selectedStoreId: string | null;
  onSelect: (storeId: string) => void;
  onDeselect: () => void;
}

export default function MapView({
  stores,
  signals,
  selectedStoreId,
  onSelect,
  onDeselect,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  // 最新のコールバックを参照し、markerの再生成を避ける
  const onSelectRef = useRef(onSelect);
  const onDeselectRef = useRef(onDeselect);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onDeselectRef.current = onDeselect;
  }, [onSelect, onDeselect]);

  useEffect(() => {
    if (!container.current || map.current) return;

    const m = new MlMap({
      container: container.current,
      style: buildStyle(),
      center: SHIBUYA,
      zoom: 14.2,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new GeolocateControl({ trackUserLocation: true }), "top-right");
    // 地図の余白をタップしても閉じられるようにする。
    // ピンはDOM要素なのでこのハンドラは発火しない
    m.on("click", () => onDeselectRef.current());
    map.current = m;

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // シグナル更新のたびにマーカーを貼り直す
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    const byStore = new Map(signals.map((s) => [s.storeId, s]));

    for (const store of stores) {
      const signal = byStore.get(store.id);
      if (!signal) continue;

      const el = buildPin(store, signal, store.id === selectedStoreId);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(store.id);
      });

      markers.current.push(
        new Marker({ element: el, anchor: "bottom" }).setLngLat([store.lng, store.lat]).addTo(m),
      );
    }
  }, [stores, signals, selectedStoreId]);

  return <div ref={container} className="h-full w-full" />;
}
