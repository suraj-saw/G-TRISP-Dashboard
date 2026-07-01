// frontend/src/components/maps/mapStyles.ts

function createRasterStyle(id: string, tileUrl: string, attribution: string) {
  return {
    version: 8,
    sources: {
      [id]: {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      {
        id: `${id}-layer`,
        type: "raster",
        source: id,
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

export const MAP_STYLES = [
  // ==========================================================================
  // Recommended Default Basemap
  // Clean vector style ideal for analytics dashboards.
  // ==========================================================================
  {
    id: "carto-light",
    label: "Carto Positron",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },

  // ==========================================================================
  // Road Map
  // Open-source street map with excellent road coverage.
  // ==========================================================================
  {
    id: "osm",
    label: "OpenStreetMap",
    url: createRasterStyle(
      "osm",
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      "© OpenStreetMap contributors"
    ),
  },

  // ==========================================================================
  // Satellite Imagery
  // Useful for analysing accident surroundings.
  // ==========================================================================
  {
    id: "esri-satellite",
    label: "Esri World Imagery",
    url: createRasterStyle(
      "esri-satellite",
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      "Tiles © Esri"
    ),
  },

  // ==========================================================================
  // Minimal Basemap
  // Best suited for heatmaps, hotspot analysis and thematic visualizations.
  // ==========================================================================
  {
    id: "esri-light-gray",
    label: "Esri Light Gray",
    url: createRasterStyle(
      "esri-light-gray",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      "Tiles © Esri"
    ),
  },

  // ==========================================================================
  // Not currently used
  // Kept for future reference.
  // ==========================================================================

  // Google tile endpoints are intentionally disabled because they are not
  // licensed for direct use with third-party map libraries such as MapLibre.

  {
    id: "google-streets",
    label: "Google Streets",
    url: createRasterStyle(
      "google-streets",
      "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      "© Google"
    ),
  },

  {
    id: "google-satellite",
    label: "Google Satellite",
    url: createRasterStyle(
      "google-satellite",
      "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      "© Google"
    ),
  },

  {
    id: "google-hybrid",
    label: "Google Hybrid",
    url: createRasterStyle(
      "google-hybrid",
      "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      "© Google"
    ),
  },

  {
    id: "google-terrain",
    label: "Google Terrain",
    url: createRasterStyle(
      "google-terrain",
      "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      "© Google"
    ),
  },

  // Carto Dark can be enabled later if a full dashboard dark theme is added.

  // {
  //   id: "carto-dark",
  //   label: "Carto Dark",
  //   url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  // },
] as const;

export function getMapStyleUrl(baseMapId?: string): any {
  const current = MAP_STYLES.find((style) => style.id === baseMapId);
  return current ? current.url : MAP_STYLES[0].url;
}
