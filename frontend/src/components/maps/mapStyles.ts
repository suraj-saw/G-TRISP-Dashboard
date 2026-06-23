export const MAP_STYLES = [
  {
    id: "osm",
    label: "OpenStreetMap",
    url: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  {
    id: "satellite",
    label: "Satellite",
    url: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Tiles © Esri",
        },
      },
      layers: [
        {
          id: "satellite",
          type: "raster",
          source: "satellite",
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    },
  },
  {
    id: "positron",
    label: "Carto Light",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
] as const;

export function getMapStyleUrl(baseMapId?: string): any {
  const current = MAP_STYLES.find((s) => s.id === baseMapId);
  return current ? current.url : MAP_STYLES[0].url;
}
