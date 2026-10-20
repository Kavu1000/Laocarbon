"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { bbox, type Boundary } from "@/lib/geo";
import { drawOverlay } from "./ProjectMap";
import { SENTINEL_YEARS, sentinelStyle, type MapStatus, type SentinelYear } from "./styles";

/** Swipe between two years of Sentinel-2 imagery over the same boundary to spot forest loss. */
export function CompareSlider({ boundary, status = "verified" }: { boundary: Boundary; status?: MapStatus }) {
  const wrap = useRef<HTMLDivElement>(null);
  const leftEl = useRef<HTMLDivElement>(null);
  const rightEl = useRef<HTMLDivElement>(null);
  const maps = useRef<{ left?: MlMap; right?: MlMap }>({});
  const [before, setBefore] = useState<SentinelYear>(2018);
  const [after, setAfter] = useState<SentinelYear>(2024);
  const [pct, setPct] = useState(50);
  const dragging = useRef(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (disposed || !leftEl.current || !rightEl.current) return;
      const bounds = bbox(boundary);
      const opts = { bounds, fitBoundsOptions: { padding: 30 }, attributionControl: false as const, cooperativeGestures: true };
      const left = new ml.Map({ container: leftEl.current, style: sentinelStyle(before), ...opts });
      const right = new ml.Map({ container: rightEl.current, style: sentinelStyle(after), ...opts });
      right.addControl(new ml.AttributionControl({ compact: true }), "bottom-right");
      right.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      for (const m of [left, right]) m.on("style.load", () => drawOverlay(m, boundary, status, false));

      // Keep both cameras identical whichever side the user drags.
      let syncing = false;
      const mirror = (from: MlMap, to: MlMap) => () => {
        if (syncing) return;
        syncing = true;
        to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
        syncing = false;
      };
      left.on("move", mirror(left, right));
      right.on("move", mirror(right, left));
      maps.current = { left, right };
    })();
    return () => {
      disposed = true;
      maps.current.left?.remove();
      maps.current.right?.remove();
      maps.current = {};
    };
  }, [JSON.stringify(boundary), status]);

  useEffect(() => {
    maps.current.left?.setStyle(sentinelStyle(before));
  }, [before]);
  useEffect(() => {
    maps.current.right?.setStyle(sentinelStyle(after));
  }, [after]);

  const moveTo = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    setPct(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div>
      <div ref={wrap} className="relative h-[380px] overflow-hidden rounded-lg border border-line bg-canvas">
        <div className="absolute inset-0">
          <div ref={leftEl} className="h-full w-full" />
        </div>
        {/* MapLibre forces position:relative on the map element, so positioning lives on a wrapper. */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
          <div ref={rightEl} className="h-full w-full" />
        </div>
        <YearLabel side="left" value={before} onChange={setBefore} />
        <YearLabel side="right" value={after} onChange={setAfter} />
        <div
          role="slider"
          aria-label="Compare imagery"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPct((p) => Math.max(0, p - 5));
            if (e.key === "ArrowRight") setPct((p) => Math.min(100, p + 5));
          }}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          className="absolute inset-y-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize touch-none"
          style={{ left: `${pct}%` }}
        >
          <div className="mx-auto h-full w-0.5 bg-white shadow" />
          <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-bold text-ink shadow-md">
            ⇆
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Drag the handle to compare cloud-free Sentinel-2 mosaics. Loss of dark-green canopy inside the outline between years can indicate deforestation.
      </p>
    </div>
  );
}

function YearLabel({ side, value, onChange }: { side: "left" | "right"; value: SentinelYear; onChange: (y: SentinelYear) => void }) {
  return (
    <label className={`absolute top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white ${side === "left" ? "left-3" : "right-14"}`}>
      {side === "left" ? "Before" : "After"}
      <select className="rounded bg-transparent font-semibold outline-none" value={value} onChange={(e) => onChange(Number(e.target.value) as SentinelYear)}>
        {SENTINEL_YEARS.map((y) => <option key={y} value={y} className="text-ink">{y}</option>)}
      </select>
    </label>
  );
}
