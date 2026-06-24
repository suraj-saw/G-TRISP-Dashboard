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
  {
    id: "google-streets",
    label: "Google Streets",
    url: createRasterStyle("google-streets", "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", "© Google"),
  },
  {
    id: "google-satellite",
    label: "Google Satellite",
    url: createRasterStyle("google-satellite", "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", "© Google"),
  },
  {
    id: "google-hybrid",
    label: "Google Hybrid",
    url: createRasterStyle("google-hybrid", "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", "© Google"),
  },
  {
    id: "google-terrain",
    label: "Google Terrain",
    url: createRasterStyle("google-terrain", "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", "© Google"),
  },
  {
    id: "osm",
    label: "OpenStreetMap",
    url: createRasterStyle("osm", "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap"),
  },
  {
    id: "esri-satellite",
    label: "Esri Satellite",
    url: createRasterStyle("esri-satellite", "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", "Tiles © Esri"),
  },
  {
    id: "esri-light-gray",
    label: "Esri Light Gray",
    url: createRasterStyle("esri-light-gray", "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", "Tiles © Esri"),
  },
  {
    id: "carto-light",
    label: "Carto Light",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
  {
    id: "carto-dark",
    label: "Carto Dark",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
] as const;

export function getMapStyleUrl(baseMapId?: string): any {
  const current = MAP_STYLES.find((s) => s.id === baseMapId);
  return current ? current.url : MAP_STYLES[0].url;
}
