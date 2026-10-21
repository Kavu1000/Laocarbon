"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { center, type Boundary } from "@/lib/geo";
import { LAOS_CENTER, SATELLITE_STYLE, STATUS_COLOR } from "./styles";

export type OverviewProject = { id: number; name: string; status: string; flagged: boolean; retired: number; lat: number | null; lng: number | null; boundary: unknown };

const statusOf = (p: OverviewProject) => (p.flagged ? "flagged" : p.status === "approved" ? "verified" : "validation");

/** All listed projects on one map: boundaries coloured by status, circles sized by tCO2e retired. */
export function OverviewMap({ projects }: { projects: OverviewProject[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const router = useRouter();
  const key = JSON.stringify(projects.map((p) => [p.id, p.retired, p.flagged, p.status]));

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (disposed || !el.current) return;
      const m = new ml.Map({ container: el.current, style: SATELLITE_STYLE, center: LAOS_CENTER, zoom: 5.2, attributionControl: { compact: true }, cooperativeGestures: true });
      map.current = m;
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

      const color = (s: string) => STATUS_COLOR[s as keyof typeof STATUS_COLOR];
      const maxRetired = Math.max(1, ...projects.map((p) => p.retired));
      const shapes = projects.filter((p) => p.boundary).map((p) => ({
        type: "Feature" as const, properties: { id: p.id, color: color(statusOf(p)) }, geometry: p.boundary as Boundary,
      }));
      const points = projects.flatMap((p) => {
        const c = p.lng !== null && p.lat !== null ? [p.lng, p.lat] : p.boundary ? center(p.boundary as Boundary) : null;
        return c ? [{
          type: "Feature" as const,
          properties: { id: p.id, name: p.name, retired: p.retired, color: color(statusOf(p)), r: 6 + 18 * Math.sqrt(p.retired / maxRetired) },
          geometry: { type: "Point" as const, coordinates: c },
        }] : [];
      });

      m.on("load", () => {
        m.addSource("shapes", { type: "geojson", data: { type: "FeatureCollection", features: shapes } });
        m.addSource("points", { type: "geojson", data: { type: "FeatureCollection", features: points } });
        m.addLayer({ id: "shape-fill", type: "fill", source: "shapes", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.3 } });
        m.addLayer({ id: "shape-line", type: "line", source: "shapes", paint: { "line-color": ["get", "color"], "line-width": 1.5 } });
        m.addLayer({
          id: "points", type: "circle", source: "points",
          paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
        });

        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        m.on("mousemove", "points", (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          m.getCanvas().style.cursor = "pointer";
          const { name, retired } = f.properties as { name: string; retired: number };
          const node = document.createElement("div");
          node.style.font = "12px system-ui";
          const b = document.createElement("b");
          b.textContent = name;
          node.append(b, document.createElement("br"), `${new Intl.NumberFormat("en-US").format(retired)} tCO₂e retired · click for details`);
          popup.setLngLat(e.lngLat).setDOMContent(node).addTo(m);
        });
        m.on("mouseleave", "points", () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
        m.on("click", "points", (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) router.push(`/projects/${id}`);
        });
        if (points.length) {
          const b = new ml.LngLatBounds();
          for (const p of points) b.extend(p.geometry.coordinates as [number, number]);
          m.fitBounds(b, { padding: 60, maxZoom: 8, duration: 0 });
        }
      });
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [key]);

  return (
    <div className="relative h-[380px] overflow-hidden rounded-lg border border-line bg-canvas">
      <div className="absolute inset-0">
        <div ref={el} className="h-full w-full" />
      </div>
      <div className="absolute bottom-2 left-2 z-10 flex gap-3 rounded-md bg-white/95 px-2.5 py-1.5 text-xs shadow-sm">
        {[["verified", "Verified"], ["validation", "In validation"], ["flagged", "Flagged"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[k as keyof typeof STATUS_COLOR] }} />{l}</span>
        ))}
        <span className="text-muted">· circle size = tCO₂e retired</span>
      </div>
    </div>
  );
}
