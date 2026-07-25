/**
 * @file RiskCorridorLegend.tsx
 * @description Map overlay component that displays a legend specifically for Risk Corridors.
 * @responsibility Shows the priority levels, colors, and line thickness representation.
 */
import {
  CORRIDOR_PRIORITY_LEVELS,
  CORRIDOR_COLORS,
  CORRIDOR_OPACITIES,
} from "../../config/riskCorridorConfig";
import type { CorridorPriorityLevel } from "../../config/riskCorridorConfig";

interface RiskCorridorLegendProps {
  visualizationLayerType?: string;
}

const LINE_WIDTHS: Record<CorridorPriorityLevel, string> = {
  Critical: "5px",
  "Very High": "4px",
  High: "3px",
  Medium: "2.5px",
  Low: "2px",
};

export default function RiskCorridorLegend({
  visualizationLayerType,
}: RiskCorridorLegendProps) {
  const isVisible = visualizationLayerType === "risk_corridors";

  if (!isVisible) return null;

  return (
    <div className="absolute bottom-5 right-3 z-20 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md rounded-lg px-2.5 py-2 pointer-events-auto min-w-[130px] font-sans">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
          Risk Priority
        </h4>
      </div>
      
      <div className="flex flex-col gap-1.5">
        {CORRIDOR_PRIORITY_LEVELS.map((level) => (
          <div
            key={level}
            className="flex items-center justify-between group cursor-default"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 flex items-center justify-center h-3">
                <div
                  className="w-full rounded-full transition-all shadow-2xs"
                  style={{
                    backgroundColor: CORRIDOR_COLORS[level],
                    height: LINE_WIDTHS[level],
                    opacity: CORRIDOR_OPACITIES[level],
                  }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-600 group-hover:text-slate-900 transition-colors">
                {level}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
