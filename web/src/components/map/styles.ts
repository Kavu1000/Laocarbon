import type { StyleSpecification } from "maplibre-gl";

// All sources are keyless. Check each provider's terms before high-traffic production use.
export const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const raster = (id: string, tiles: string, attribution: string, maxzoom: number): StyleSpecification => ({
  version: 8,
  sources: { [id]: { type: "raster", tiles: [tiles], tileSize: 256, attribution, maxzoom } },
  layers: [{ id, type: "raster", source: id }],
});

export const SATELLITE_STYLE = raster(
  "esri",
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "Imagery © Esri, Maxar, Earthstar Geographics",
  19,
);

/** Cloud-free yearly Sentinel-2 mosaics (EOX) — used to compare forest cover over time. */
export const SENTINEL_YEARS = [2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024] as const;
export type SentinelYear = (typeof SENTINEL_YEARS)[number];

export const sentinelStyle = (year: SentinelYear) =>
  raster(
    `s2-${year}`,
    `https://tiles.maps.eox.at/wmts/1.0.0/${year === 2016 ? "s2cloudless_3857" : `s2cloudless-${year}_3857`}/default/g/{z}/{y}/{x}.jpg`,
    `Sentinel-2 cloudless ${year} by <a href="https://s2maps.eu" target="_blank" rel="noopener">EOX IT Services GmbH</a> (contains modified Copernicus Sentinel data)`,
    15,
  );

export const STATUS_COLOR = { verified: "#16a34a", validation: "#d97706", flagged: "#dc2626" } as const;
export type MapStatus = keyof typeof STATUS_COLOR;

export const LAOS_CENTER: [number, number] = [103.9, 18.2];
