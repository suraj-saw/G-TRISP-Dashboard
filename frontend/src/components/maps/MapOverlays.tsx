/**
 * @file MapOverlays.tsx
 * @description (Currently inactive/commented out) Legacy legend overlay components.
 */
// // frontend/src/components/maps/MapOverlays.tsx


// import { HEATMAP_LEGEND_GRADIENT } from "../../config/Heapmapconfig";

// // ---------------------------------------------------------------------------
// // Density legend (bottom-left gradient bar)
// // ---------------------------------------------------------------------------

// export function DensityLegend({ title = "Accident Density" }: { title?: string }) {
//   return (
//     <div className="pointer-events-none absolute bottom-6 left-4 z-10 select-none">
//       <div className="rounded-xl border border-[#E4E8F4] bg-white/90 px-4 py-3 shadow-lg backdrop-blur-sm">
//         <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
//           {title}
//         </p>
//         <div
//           className="h-2.5 w-44 rounded-full"
//           style={{ background: HEATMAP_LEGEND_GRADIENT }}
//         />
//         <div className="mt-1.5 flex justify-between text-[10px] font-medium text-slate-500">
//           <span>Low</span>
//           <span>Moderate</span>
//           <span>High</span>
//         </div>
//       </div>
//     </div>
//   );
// }

// // ---------------------------------------------------------------------------
// // Convenience bundle — renders just the legend for the density heatmap view.
// // ---------------------------------------------------------------------------

// export function DensityMapOverlays({
//   data: _data,
//   subtitle: _subtitle,
//   title = "Accident Density",
// }: {
//   data?: unknown;
//   subtitle?: string;
//   title?: string;
// }) {
//   return <DensityLegend title={title} />;
// }
