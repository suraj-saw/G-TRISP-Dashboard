/**
 * @file CompactBlackspotPopup.tsx
 * @description Compact, high-density popup card for blackspot cluster visualizations on map layers.
 * @responsibility Renders blackspot metadata (priority level, cluster ID, crash breakdown by severity, total crashes) in a sleek, space-efficient layout.
 */

import { Download } from "lucide-react";
import { getPriorityColor, getPriorityLabel } from "../../config/blackspotConfig";

export interface BlackspotPopupData {
  bs_id?: number | string;
  priority_score?: number;
  priority_label?: string;
  fatal_count?: number;
  grievous_count?: number;
  minor_hospitalized_count?: number;
  minor_non_hospitalized_count?: number;
  qualifying_count?: number;
  crash_count?: number;
  accident_count?: number;
  crash_ids?: string;
  aatc?: number;
  start_m?: number;
  end_m?: number;
}

interface CompactBlackspotPopupProps {
  data: BlackspotPopupData;
  onExport?: (data: BlackspotPopupData) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  radiusM?: number;
  segmentM?: number;
}

/**
 * Ultra-compact Blackspot Cluster Popup Component
 */
export default function CompactBlackspotPopup({
  data,
  onExport,
  onMouseEnter,
  onMouseLeave,
  radiusM = 250,
  segmentM,
}: CompactBlackspotPopupProps) {
  const priorityScore = data.priority_score ?? 0;
  const priorityColor = getPriorityColor(priorityScore);
  const priorityLabel =
    data.priority_label ?? getPriorityLabel(priorityScore);

  const totalCrashes = data.crash_count ?? data.accident_count ?? 0;
  const qualifyingCrashes = data.qualifying_count ?? totalCrashes;

  return (
    <div
      className="w-[210px] sm:w-[220px] overflow-hidden rounded-xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-200/90 font-sans tracking-tight text-slate-800 transition-all select-none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Top Banner with Priority Label and Export Button */}
      <div
        className="px-2.5 py-1 text-[9.5px] font-bold tracking-wider text-white uppercase flex items-center justify-between"
        style={{ backgroundColor: priorityColor }}
      >
        <span className="truncate max-w-[155px]">{priorityLabel}</span>
        {data.crash_ids && onExport && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExport(data);
            }}
            className="pointer-events-auto p-0.5 rounded hover:bg-white/20 text-white transition-colors ml-1 shrink-0 cursor-pointer"
            title="Export Accident Data"
            type="button"
          >
            <Download size={12} />
          </button>
        )}
      </div>

      {/* Main Content Body */}
      <div className="p-2.5 space-y-2">
        {/* Cluster Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-800 truncate">
            {data.bs_id !== undefined ? `Cluster #${data.bs_id}` : "Blackspot"}
          </span>
          {data.aatc !== undefined && (
            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              AATC: {data.aatc.toFixed(1)}
            </span>
          )}
        </div>

        {/* 4-Stat Breakdown Grid */}
        <div className="grid grid-cols-4 gap-1 text-center">
          <div className="flex flex-col items-center py-1 px-0.5 rounded-md bg-red-50/90 border border-red-100/80">
            <span className="text-[8.5px] font-semibold text-slate-500 uppercase tracking-wider">
              Fatal
            </span>
            <span className="text-[11px] font-bold text-[#78350F]">
              {data.fatal_count ?? "—"}
            </span>
          </div>

          <div className="flex flex-col items-center py-1 px-0.5 rounded-md bg-orange-50/90 border border-orange-100/80">
            <span className="text-[8.5px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-full">
              Grievous
            </span>
            <span className="text-[11px] font-bold text-[#EA580C]">
              {data.grievous_count ?? "—"}
            </span>
          </div>

          <div className="flex flex-col items-center py-1 px-0.5 rounded-md bg-amber-50/90 border border-amber-100/80">
            <span className="text-[8.5px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-full">
              Min Hosp
            </span>
            <span className="text-[11px] font-bold text-[#D97706]">
              {data.minor_hospitalized_count ?? "—"}
            </span>
          </div>

          <div className="flex flex-col items-center py-1 px-0.5 rounded-md bg-sky-50/90 border border-sky-100/80">
            <span className="text-[8.5px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-full">
              Min Non
            </span>
            <span className="text-[11px] font-bold text-[#0284C7]">
              {data.minor_non_hospitalized_count ?? "—"}
            </span>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-[10px] text-slate-500 text-center pt-1.5 border-t border-slate-100 leading-tight">
          <span className="font-bold text-slate-700">
            {totalCrashes.toLocaleString()}
          </span>{" "}
          crashes ({qualifyingCrashes} qualifying){" "}
          {segmentM !== undefined
            ? `within ${segmentM.toFixed(0)}m segment`
            : `within ${radiusM}m`}
        </div>
      </div>
    </div>
  );
}
