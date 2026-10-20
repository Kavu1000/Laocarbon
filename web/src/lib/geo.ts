export type Position = [number, number]; // [lng, lat]
export type PolygonGeom = { type: "Polygon"; coordinates: Position[][] };
export type MultiPolygonGeom = { type: "MultiPolygon"; coordinates: Position[][][] };
export type Boundary = PolygonGeom | MultiPolygonGeom;

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

function ringAreaM2(ring: Position[]) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    a += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((a * R * R) / 2);
}

const polygons = (b: Boundary): Position[][][] => (b.type === "Polygon" ? [b.coordinates] : b.coordinates);

/** Geodesic area in hectares (outer rings minus holes). */
export function areaHa(b: Boundary) {
  return polygons(b).reduce((sum, [outer, ...holes]) => sum + ringAreaM2(outer) - holes.reduce((h, r) => h + ringAreaM2(r), 0), 0) / 10_000;
}

export function bbox(b: Boundary): [number, number, number, number] {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const poly of polygons(b)) for (const [lng, lat] of poly[0]) {
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

/** Centre of the bounding box — good enough for placing a pin on a forest parcel. */
export function center(b: Boundary): Position {
  const [w, s, e, n] = bbox(b);
  return [(w + e) / 2, (s + n) / 2];
}

const closeRing = (ring: Position[]): Position[] => {
  const [f, l] = [ring[0], ring[ring.length - 1]];
  return f[0] === l[0] && f[1] === l[1] ? ring : [...ring, f];
};

export function ringToPolygon(points: Position[]): PolygonGeom {
  return { type: "Polygon", coordinates: [closeRing(points)] };
}

function validRing(ring: unknown): ring is Position[] {
  return (
    Array.isArray(ring) && ring.length >= 4 &&
    ring.every((p) => Array.isArray(p) && p.length >= 2 && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
  );
}

/** Accepts a GeoJSON Geometry, Feature or FeatureCollection; merges all polygons into one boundary. */
export function boundaryFromGeoJSON(input: unknown): Boundary {
  const polys: Position[][][] = [];
  const visit = (g: any) => {
    if (!g) return;
    if (g.type === "FeatureCollection") g.features?.forEach((f: any) => visit(f));
    else if (g.type === "Feature") visit(g.geometry);
    else if (g.type === "GeometryCollection") g.geometries?.forEach(visit);
    else if (g.type === "Polygon") polys.push(g.coordinates);
    else if (g.type === "MultiPolygon") polys.push(...g.coordinates);
  };
  visit(input);
  const clean = polys
    .map((p) => p.map((r) => r.map((pt) => [Number(pt[0]), Number(pt[1])] as Position)).map(closeRing))
    .filter((p) => validRing(p[0]));
  if (!clean.length) throw new Error("No polygon found in this file");
  return clean.length === 1 ? { type: "Polygon", coordinates: clean[0] } : { type: "MultiPolygon", coordinates: clean };
}

/** Minimal KML reader: every <Polygon>'s outer/inner rings. */
export function boundaryFromKML(text: string): Boundary {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("This KML file could not be read");
  const parseCoords = (s: string | null | undefined) =>
    (s ?? "").trim().split(/\s+/).map((t) => t.split(",").map(Number)).filter((c) => c.length >= 2 && !c.some(Number.isNaN)).map((c) => [c[0], c[1]] as Position);
  const polys = [...doc.getElementsByTagName("Polygon")].map((p) => {
    const outer = p.getElementsByTagName("outerBoundaryIs")[0]?.getElementsByTagName("coordinates")[0]?.textContent;
    const inner = [...p.getElementsByTagName("innerBoundaryIs")].map((i) => i.getElementsByTagName("coordinates")[0]?.textContent);
    return [parseCoords(outer), ...inner.map(parseCoords)];
  });
  return boundaryFromGeoJSON({ type: "MultiPolygon", coordinates: polys });
}

export async function boundaryFromFile(file: File): Promise<Boundary> {
  const text = await file.text();
  if (/\.kml$/i.test(file.name) || text.trimStart().startsWith("<")) return boundaryFromKML(text);
  try {
    return boundaryFromGeoJSON(JSON.parse(text));
  } catch (e) {
    throw e instanceof SyntaxError ? new Error("This file isn't valid GeoJSON") : e;
  }
}

/** [lng, lat] when both coordinates are real numbers (DB values may be null or absent). */
export function pinFrom(lat: unknown, lng: unknown): Position | null {
  const la = typeof lat === "string" ? Number(lat) : lat;
  const ln = typeof lng === "string" ? Number(lng) : lng;
  return typeof la === "number" && typeof ln === "number" && Number.isFinite(la) && Number.isFinite(ln) ? [ln, la] : null;
}

// Large parcels are shown to 4 significant figures: GPS-traced areas aren't accurate to the hectare.
export const fmtHa = (ha: number) =>
  `${new Intl.NumberFormat("en-US", ha >= 1000 ? { maximumSignificantDigits: 4 } : { maximumFractionDigits: ha < 100 ? 1 : 0 }).format(ha)} ha`;
