"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { areaHa, bbox, fmtHa, ringToPolygon, type Boundary, type Position } from "@/lib/geo";
import { LAOS_CENTER, SATELLITE_STYLE } from "./styles";

type Mode = "draw" | "pin" | "pan";

/**
 * Lets a forest owner trace their parcel on satellite imagery (click to add corners) and drop a GPS pin.
 * Uploaded GeoJSON/KML arrives through `boundary` and is shown the same way.
 */
export function BoundaryEditor({
  boundary,
  pin,
  onBoundary,
  onPin,
}: {
  boundary: Boundary | null;
  pin: Position | null;
  onBoundary: (b: Boundary | null) => void;
  onPin: (p: Position | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [mode, setMode] = useState<Mode>(boundary ? "pan" : "draw");
  const [draft, setDraft] = useState<Position[]>([]);
  const [loaded, setLoaded] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cb = useRef({ onPin, setDraft });
  cb.current = { onPin, setDraft };

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (disposed || !el.current) return;
      const m = new ml.Map({ container: el.current, style: SATELLITE_STYLE, center: LAOS_CENTER, zoom: 5.3, attributionControl: { compact: true } });
      map.current = m;
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      m.on("load", () => {
        m.addSource("shape", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "shape-fill", type: "fill", source: "shape", paint: { "fill-color": "#22c55e", "fill-opacity": 0.3 } });
        m.addLayer({ id: "shape-line", type: "line", source: "shape", paint: { "line-color": "#4ade80", "line-width": 2.5 } });
        m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#fde047", "line-width": 2, "line-dasharray": [2, 1] } });
        m.addLayer({ id: "draft-pts", type: "circle", source: "draft", filter: ["==", "$type", "Point"], paint: { "circle-radius": 5, "circle-color": "#fde047", "circle-stroke-color": "#000", "circle-stroke-width": 1 } });
        setLoaded(true);
      });
      m.on("click", (e) => {
        const p: Position = [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))];
        if (modeRef.current === "draw") cb.current.setDraft((d) => [...d, p]);
        if (modeRef.current === "pin") cb.current.onPin(p);
      });
      markerRef.current = new ml.Marker({ color: "#ef4444", draggable: true }).setLngLat(LAOS_CENTER);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current!.getLngLat();
        cb.current.onPin([Number(ll.lng.toFixed(6)), Number(ll.lat.toFixed(6))]);
      });
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Saved / uploaded boundary
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    (m.getSource("shape") as GeoJSONSource).setData(
      boundary ? { type: "Feature", properties: {}, geometry: boundary } : { type: "FeatureCollection", features: [] },
    );
    if (boundary) m.fitBounds(bbox(boundary), { padding: 40, maxZoom: 16 });
  }, [loaded, JSON.stringify(boundary)]);

  // In-progress outline
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    (m.getSource("draft") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [
        ...draft.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: p } })),
        ...(draft.length > 1
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: draft.length > 2 ? [...draft, draft[0]] : draft } }]
          : []),
      ],
    });
  }, [loaded, draft]);

  // GPS pin
  useEffect(() => {
    const m = map.current;
    const mk = markerRef.current;
    if (!m || !mk || !loaded) return;
    if (pin) {
      mk.setLngLat(pin).addTo(m);
      if (!boundary) m.flyTo({ center: pin, zoom: Math.max(m.getZoom(), 13) });
    } else mk.remove();
  }, [loaded, pin?.[0], pin?.[1]]);

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = mode === "pan" ? "" : "crosshair";
  }, [mode, loaded]);

  function finish() {
    if (draft.length < 3) return;
    onBoundary(ringToPolygon(draft));
    setDraft([]);
    setMode("pan");
  }

  const area = boundary ? areaHa(boundary) : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {([
          ["draw", "Draw boundary"],
          ["pin", "Drop pin"],
          ["pan", "Move map"],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${mode === m ? "border-brand bg-brand text-white" : "border-line bg-white hover:bg-canvas"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted">
          {area !== null ? <>Mapped area: <strong className="text-ink">{fmtHa(area)}</strong></> : "No boundary yet"}
        </span>
      </div>
      <div className="relative h-[380px] overflow-hidden rounded-lg border border-line">
        <div className="absolute inset-0">
          <div ref={el} className="h-full w-full" />
        </div>
        {mode === "draw" && (
          <div className="absolute left-3 top-3 z-10 max-w-[260px] rounded-md bg-white/95 p-2 text-xs shadow">
            Click the map to add corners of the forest parcel ({draft.length} added).
            <div className="mt-2 flex gap-1.5">
              <button type="button" className="btn-primary px-2.5 py-1 text-xs" disabled={draft.length < 3} onClick={finish}>Finish shape</button>
              <button type="button" className="btn-secondary px-2.5 py-1 text-xs" disabled={!draft.length} onClick={() => setDraft((d) => d.slice(0, -1))}>Undo</button>
            </div>
          </div>
        )}
        {mode === "pin" && (
          <div className="absolute left-3 top-3 z-10 rounded-md bg-white/95 p-2 text-xs shadow">Click the map to place the GPS pin. You can drag it afterwards.</div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {boundary && <button type="button" className="text-xs text-danger underline" onClick={() => onBoundary(null)}>Remove boundary</button>}
        {pin && <button type="button" className="text-xs text-danger underline" onClick={() => onPin(null)}>Remove pin</button>}
      </div>
    </div>
  );
}
