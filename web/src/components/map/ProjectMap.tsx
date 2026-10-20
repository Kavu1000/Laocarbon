"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { bbox, center, type Boundary, type Position } from "@/lib/geo";
import { LAOS_CENTER, SATELLITE_STYLE, STATUS_COLOR, STREET_STYLE, type MapStatus } from "./styles";

type Basemap = "satellite" | "street";

/** Read-only map of a project's boundary and GPS pin, with a street/satellite toggle. */
export function ProjectMap({
  boundary,
  pin,
  status = "verified",
  className = "h-[420px]",
}: {
  boundary?: Boundary | null;
  pin?: Position | null;
  status?: MapStatus;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [failed, setFailed] = useState(false);
  const marker = pin ?? (boundary ? center(boundary) : null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (disposed || !el.current) return;
      const m = new ml.Map({
        container: el.current,
        style: SATELLITE_STYLE,
        center: marker ?? LAOS_CENTER,
        zoom: marker ? 9 : 5,
        attributionControl: { compact: true },
        cooperativeGestures: true,
      });
      map.current = m;
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new ml.FullscreenControl(), "top-right");
      m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      m.on("error", (e) => {
        if (/style|Failed to fetch/i.test(String(e.error?.message))) setFailed(true);
      });
      m.on("style.load", () => drawOverlay(m, boundary, status));
      if (marker) new ml.Marker({ color: STATUS_COLOR[status] }).setLngLat(marker).addTo(m);
      if (boundary) m.fitBounds(bbox(boundary), { padding: 40, duration: 0, maxZoom: 14 });
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // Recreate only when the project geometry changes; basemap switches redraw via style.load.
  }, [JSON.stringify(boundary), marker?.[0], marker?.[1], status]);

  function switchTo(b: Basemap) {
    setBasemap(b);
    map.current?.setStyle((b === "satellite" ? SATELLITE_STYLE : STREET_STYLE) as StyleSpecification | string);
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-canvas ${className}`}>
      <div className="absolute inset-0">
        <div ref={el} className="h-full w-full" />
      </div>
      <div className="absolute left-3 top-3 z-10 flex overflow-hidden rounded-md border border-line bg-white text-xs font-medium shadow-sm">
        {(["satellite", "street"] as const).map((b) => (
          <button
            key={b}
            onClick={() => switchTo(b)}
            className={`px-3 py-1.5 ${basemap === b ? "bg-brand text-white" : "hover:bg-canvas"}`}
          >
            {b === "satellite" ? "Satellite" : "Map"}
          </button>
        ))}
      </div>
      {!boundary && !marker && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto w-fit rounded bg-white/90 px-3 py-1 text-xs text-muted">
          No boundary submitted yet
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-canvas/90 text-sm text-muted">Map tiles couldn't load — check your connection.</div>
      )}
    </div>
  );
}

export function drawOverlay(m: MlMap, boundary: Boundary | null | undefined, status: MapStatus, fill = true) {
  if (!boundary || m.getSource("boundary")) return;
  m.addSource("boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: boundary } });
  if (fill) {
    m.addLayer({ id: "boundary-fill", type: "fill", source: "boundary", paint: { "fill-color": STATUS_COLOR[status], "fill-opacity": 0.25 } });
  }
  m.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": STATUS_COLOR[status], "line-width": 2.5 } });
}
