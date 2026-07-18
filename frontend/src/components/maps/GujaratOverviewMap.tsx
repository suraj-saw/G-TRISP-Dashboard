/**
 * @file GujaratOverviewMap.tsx
 * @description (Currently inactive/commented out) Legacy Maplibre-based state overview map.
 */
// // frontend/src/components/maps/GujaratOverviewMap.tsx
// import { useEffect, useMemo, useState, useCallback, useRef } from "react";
// import MapGL, {
//   Source,
//   Layer,
//   Popup,
//   NavigationControl,
// } from "react-map-gl/maplibre";
// import type { MapRef, MapLayerMouseEvent } from "react-map-gl/maplibre";
// import "maplibre-gl/dist/maplibre-gl.css";
// import { useNavigate } from "react-router-dom";
// import { Loader2, AlertCircle } from "lucide-react";
// import { fetchAllGujaratDistricts } from "../../api/geoApi";
// import { fetchGujaratDistrictSummary } from "../../api/gujaratDashboardApi";
// import { getMapStyleUrl } from "./mapStyles";
// import {
//   GUJARAT_MAP_CENTER,
//   buildDistrictDashboardPath,
// } from "../../config/constants";
// import CoordinateStatusBar from "./CoordinateStatusBar";

// interface HoverInfo {
//   longitude: number;
//   latitude: number;
//   name: string;
//   count: number;
// }

// export default function GujaratOverviewMap() {
//   const navigate = useNavigate();
//   const mapRef = useRef<MapRef>(null);

//   const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(
//     null
//   );
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [hovered, setHovered] = useState<HoverInfo | null>(null);
//   const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
//   const [contextMenuCoords, setContextMenuCoords] = useState<{lat: number, lng: number} | null>(null);

//   useEffect(() => {
//     let active = true;

//     Promise.all([
//       fetchAllGujaratDistricts(),
//       fetchGujaratDistrictSummary().catch(() => []),
//     ])
//       .then(([districts, summary]) => {
//         if (!active) return;

//         const countByName = new Map(
//           summary.map((s) => [
//             s.district.trim().toLowerCase(),
//             s.accident_count,
//           ])
//         );

//         const withCounts: GeoJSON.FeatureCollection = {
//           ...districts,
//           features: districts.features.map((f) => {
//             const name = String(f.properties?.name ?? "")
//               .trim()
//               .toLowerCase();
//             return {
//               ...f,
//               properties: {
//                 ...f.properties,
//                 accident_count: countByName.get(name) ?? 0,
//               },
//             };
//           }),
//         };

//         setGeojson(withCounts);
//       })
//       .catch(() => setError("Could not load Gujarat district boundaries."))
//       .finally(() => {
//         if (active) setLoading(false);
//       });

//     return () => {
//       active = false;
//     };
//   }, []);

//   const maxCount = useMemo(() => {
//     if (!geojson) return 1;
//     return Math.max(
//       1,
//       ...geojson.features.map((f) => Number(f.properties?.accident_count) || 0)
//     );
//   }, [geojson]);

//   const fillColorExpr = useMemo(
//     () => [
//       "interpolate",
//       ["linear"],
//       ["coalesce", ["get", "accident_count"], 0],
//       0,
//       "#EEF3FF",
//       maxCount,
//       "#1e3a8a",
//     ],
//     [maxCount]
//   );

//   const handleMouseMove = useCallback((e: any) => {
//     const feature = e.features?.[0];
//     const map = mapRef.current?.getMap();
//     if (!feature) {
//       setHovered(null);
//       setHoveredSlug(null);
//       if (map) map.getCanvas().style.cursor = "";
//       return;
//     }
//     if (map) map.getCanvas().style.cursor = "pointer";
//     setHoveredSlug(String(feature.properties?.slug ?? ""));
//     setHovered({
//       longitude: e.lngLat.lng,
//       latitude: e.lngLat.lat,
//       name: String(feature.properties?.name ?? "Unknown"),
//       count: Number(feature.properties?.accident_count) || 0,
//     });
//   }, []);

//   const handleMouseLeave = useCallback(() => {
//     setHovered(null);
//     setHoveredSlug(null);
//     const map = mapRef.current?.getMap();
//     if (map) map.getCanvas().style.cursor = "";
//   }, []);

//   const handleClick = useCallback(
//     (e: any) => {
//       const feature = e.features?.[0];
//       const slug = feature?.properties?.slug;
//       if (slug) {
//         navigate(buildDistrictDashboardPath(String(slug)));
//       }
//     },
//     [navigate]
//   );

//   const onContextMenu = useCallback((e: MapLayerMouseEvent) => {
//     e.preventDefault();
//     setContextMenuCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
//   }, []);

//   return (
//     <div className="absolute inset-0 overflow-hidden">
//       {loading && (
//         <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
//           <Loader2 size={36} className="text-[#2C6EF2] animate-spin mb-3" />
//           <p className="text-sm font-semibold text-slate-500">
//             Loading Gujarat districts…
//           </p>
//         </div>
//       )}
//       {error && !loading && (
//         <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-2 shadow">
//           <AlertCircle size={14} />
//           {error}
//         </div>
//       )}

//       <MapGL
//         ref={mapRef}
//         initialViewState={GUJARAT_MAP_CENTER}
//         mapStyle={getMapStyleUrl("carto-light")}
//         style={{ width: "100%", height: "100%" }}
//         interactiveLayerIds={["gujarat-districts-fill"]}
//         onMouseMove={handleMouseMove}
//         onMouseLeave={handleMouseLeave}
//         onClick={handleClick}
//         onContextMenu={onContextMenu}
//         attributionControl={false}
//       >
//         <NavigationControl position="top-right" showCompass />
//         {geojson && (
//           <Source id="gujarat-districts" type="geojson" data={geojson}>
//             <Layer
//               id="gujarat-districts-fill"
//               type="fill"
//               paint={{
//                 "fill-color": fillColorExpr as any,
//                 "fill-opacity": 0.78,
//               }}
//             />
//             <Layer
//               id="gujarat-districts-line"
//               type="line"
//               paint={{
//                 "line-color": "#1e3a8a",
//                 "line-width": 1,
//                 "line-opacity": 0.6,
//               }}
//             />
//             <Layer
//               id="gujarat-districts-hover-outline"
//               type="line"
//               filter={["==", ["get", "slug"], hoveredSlug ?? "__none__"]}
//               paint={{
//                 "line-color": "#F59E0B",
//                 "line-width": 3,
//               }}
//             />
//           </Source>
//         )}
//         {hovered && (
//           <Popup
//             longitude={hovered.longitude}
//             latitude={hovered.latitude}
//             closeButton={false}
//             closeOnClick={false}
//             anchor="bottom"
//             offset={10}
//           >
//             <div style={{ minWidth: 150, fontFamily: "inherit" }}>
//               <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>
//                 {hovered.name}
//               </div>
//               <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
//                 {hovered.count.toLocaleString()} accidents · Click to explore
//               </div>
//             </div>
//           </Popup>
//         )}
//         {/* Coordinate Status Bar */}
//         <CoordinateStatusBar />

//         {contextMenuCoords && (
//           <Popup
//             longitude={contextMenuCoords.lng}
//             latitude={contextMenuCoords.lat}
//             closeButton={true}
//             closeOnClick={true}
//             onClose={() => setContextMenuCoords(null)}
//             anchor="top"
//             className="z-50"
//           >
//             <div className="p-1 text-xs font-semibold text-slate-800">
//               <div>Lat: {contextMenuCoords.lat.toFixed(6)}</div>
//               <div>Lng: {contextMenuCoords.lng.toFixed(6)}</div>
//             </div>
//           </Popup>
//         )}
//       </MapGL>

//       <div className="absolute bottom-1 right-2 z-10 text-[10px] text-slate-400 pointer-events-none">
//         © MapLibre · © CARTO · © OpenStreetMap
//       </div>
//     </div>
//   );
// }
