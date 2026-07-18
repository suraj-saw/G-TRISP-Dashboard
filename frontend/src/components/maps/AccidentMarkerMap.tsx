/**
 * @file AccidentMarkerMap.tsx
 * @description (Currently inactive/commented out) A map visualization layer designed to show individual accidents and dynamic clusters.
 */
// // frontend/src/components/maps/AccidentMarkerMap.tsx
// import { useMemo } from "react";
// import Map, { Source, Layer } from "react-map-gl/maplibre";
// import "maplibre-gl/dist/maplibre-gl.css";
// import { useDashboard } from "../../hooks/useDashboard";
// import { getMapStyleUrl } from "./mapStyles";
// import { GUJARAT_MAP_CENTER } from "../../config/constants";
// import { defaultFilters } from "../../features/dashboard/filterConfig";

// interface Props {
//   baseMap?: string;
// }

// export default function AccidentMarkerMap({ baseMap }: Props) {
//   const { data } = useDashboard(defaultFilters);

//   const geojsonData = useMemo(() => {
//     return {
//       type: "FeatureCollection",
//       features:
//         data?.heatmap?.map((p) => ({
//           type: "Feature",
//           geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
//           properties: { id: p.accident_id },
//         })) || [],
//     };
//   }, [data]);

//   return (
//     <div className="h-full w-full rounded-xl overflow-hidden shadow-sm border border-[#E4E8F4] relative">
//       <Map
//         initialViewState={GUJARAT_MAP_CENTER}
//         mapStyle={getMapStyleUrl(baseMap)}
//       >
//         <Source
//           type="geojson"
//           data={geojsonData as any}
//           cluster={true}
//           // Dissolve clusters at zoom 15 so individual accidents are always
//           // visible when the user is zoomed to street level.
//           clusterMaxZoom={15}
//           // Wider grouping radius reduces bubble count at overview zoom,
//           // making the map far easier to read at the Gujarat district scale.
//           clusterRadius={65}
//         >
//           {/* ── Cluster bubbles — dashboard blue palette ── */}
//           <Layer
//             id="clusters"
//             type="circle"
//             filter={["has", "point_count"]}
//             paint={{
//               "circle-color": [
//                 "step",
//                 ["get", "point_count"],
//                 "#2C6EF2", // 1–99   medium blue
//                 100,
//                 "#1D5BD4", // 100–749  deeper blue
//                 750,
//                 "#0A3490", // 750+    deep navy
//               ],
//               "circle-radius": [
//                 "step",
//                 ["get", "point_count"],
//                 14, // 1–99
//                 100,
//                 19, // 100–749
//                 750,
//                 24, // 750+
//               ],
//               "circle-stroke-width": 1.5,
//               "circle-stroke-color": "#FFFFFF",
//               "circle-opacity": 0.92,
//             }}
//           />

//           {/* ── Cluster count labels ── */}
//           <Layer
//             id="cluster-count"
//             type="symbol"
//             filter={["has", "point_count"]}
//             layout={{
//               "text-field": "{point_count_abbreviated}",
//               "text-size": 11,
//             }}
//             paint={{
//               "text-color": "#FFFFFF",
//               "text-halo-color": "rgba(0,0,0,0.18)",
//               "text-halo-width": 0.5,
//             }}
//           />

//           {/* ── Individual accident points (unclustered) ── */}
//           <Layer
//             id="unclustered-point"
//             type="circle"
//             filter={["!", ["has", "point_count"]]}
//             paint={{
//               // Softer warm orange-red — less visually aggressive than a
//               // saturated primary red, still clearly distinguishable on all
//               // supported basemaps including Esri Light Gray.
//               "circle-color": "#E8603A",
//               // Zoom-responsive radius: compact at overview, larger at street
//               // level so individual incidents are easy to tap/click.
//               "circle-radius": [
//                 "interpolate",
//                 ["linear"],
//                 ["zoom"],
//                 6,
//                 2.5,
//                 9,
//                 3.5,
//                 12,
//                 5,
//                 15,
//                 7,
//               ],
//               "circle-opacity": [
//                 "interpolate",
//                 ["linear"],
//                 ["zoom"],
//                 6,
//                 0.55,
//                 10,
//                 0.72,
//                 14,
//                 0.9,
//               ],
//               "circle-stroke-width": 0.8,
//               "circle-stroke-color": "#FFFFFF",
//             }}
//           />
//         </Source>
//       </Map>
//     </div>
//   );
// }
