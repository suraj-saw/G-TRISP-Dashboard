// frontend/src/components/layout/ExportButton.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { downloadExport, type ExportFormat } from "../../api/exportApi";
import type { DashboardFilters } from "../../types/dashboard";

interface Props {
  filters: DashboardFilters;
}

type Status = "idle" | "loading" | "success" | "error";

interface MenuPos {
  top: number;
  left: number;
  width: number;
}

export default function ExportButton({ filters }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the dropdown menu above the trigger button
  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.top - 8, // will be flipped to open upward via CSS
      left: rect.left,
      width: rect.width,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const close = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  // Auto-clear success/error after 3 s
  useEffect(() => {
    if (status === "success" || status === "error") {
      const timer = setTimeout(() => {
        setStatus("idle");
        setErrorMsg(null);
        setActiveFormat(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleExport = async (format: ExportFormat) => {
    setOpen(false);
    setStatus("loading");
    setActiveFormat(format);
    setErrorMsg(null);

    try {
      await downloadExport(filters, format);
      setStatus("success");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Export failed. Please try again.";
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  // Determine button appearance based on current status
  const buttonLabel = () => {
    switch (status) {
      case "loading":
        return (
          <>
            <Loader2 size={13} className="animate-spin" />
            Exporting…
          </>
        );
      case "success":
        return (
          <>
            <CheckCircle size={13} className="text-emerald-600" />
            <span className="text-emerald-700">Downloaded!</span>
          </>
        );
      case "error":
        return (
          <>
            <AlertCircle size={13} className="text-red-500" />
            <span className="text-red-600">Failed</span>
          </>
        );
      default:
        return (
          <>
            <Download size={13} />
            Export Data
          </>
        );
    }
  };

  const triggerClass = () => {
    const base =
      "flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-2.5 text-[12px] font-semibold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
    switch (status) {
      case "success":
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
      case "error":
        return `${base} border-red-200 bg-red-50 text-red-600`;
      case "loading":
        return `${base} border-[#E4E8F4] bg-white text-[#6B7299]`;
      default:
        return `${base} border-[#E4E8F4] bg-white text-[#1e3a8a] hover:border-[#1e3a8a] hover:bg-[#EEF2FB]`;
    }
  };

  return (
    <div className="relative w-full">
      {/* Error message */}
      {status === "error" && errorMsg && (
        <p className="mb-1.5 text-[10px] text-red-500 px-1 leading-snug">
          {errorMsg}
        </p>
      )}

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={status === "loading"}
        onClick={() => {
          if (status === "idle") setOpen((v) => !v);
        }}
        className={triggerClass()}
      >
        {buttonLabel()}
      </button>

      {/* Dropdown menu — portalled so it escapes sidebar overflow:hidden */}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              // Open upward: anchor bottom of menu to top of trigger
              bottom: window.innerHeight - pos.top,
              left: pos.left,
              width: Math.max(pos.width, 180),
              zIndex: 9999,
            }}
            className="rounded-xl border border-[#E4E8F4] bg-white shadow-[0_-8px_32px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-[#F1F4FB] bg-[#F7F9FD]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7299]">
                Download Format
              </p>
            </div>

            {/* Options */}
            <div className="p-1.5 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => handleExport("csv")}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1A1D2E] hover:bg-[#EEF2FB] hover:text-[#1e3a8a] transition"
              >
                <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-orange-50 shrink-0">
                  <FileText size={16} className="text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-[12px]">CSV File</p>
                  <p className="text-[10px] text-[#9BA3C2]">
                    Compatible with any spreadsheet app
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleExport("excel")}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1A1D2E] hover:bg-[#EEF2FB] hover:text-[#1e3a8a] transition"
              >
                <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-50 shrink-0">
                  <FileSpreadsheet size={16} className="text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-[12px]">
                    Excel File (.xlsx)
                  </p>
                  <p className="text-[10px] text-[#9BA3C2]">
                    Styled with headers &amp; filters
                  </p>
                </div>
              </button>
            </div>

            {/* Active filter summary */}
            <ActiveFilterSummary filters={filters} />
          </div>,
          document.body
        )}
    </div>
  );
}

// Small helper that shows which filters are currently active
function ActiveFilterSummary({ filters }: { filters: DashboardFilters }) {
  const active: string[] = [];

  if (filters.district && filters.district !== "all")
    active.push(`Station: ${filters.district}`);
  if (filters.year && filters.year !== "all")
    active.push(`Year: ${filters.year}`);
  if (filters.severity && filters.severity !== "all")
    active.push(`Severity: ${filters.severity}`);
  if (filters.road_classification && filters.road_classification !== "all")
    active.push(`Road: ${filters.road_classification}`);
  if (filters.weather_condition && filters.weather_condition !== "all")
    active.push(`Weather: ${filters.weather_condition}`);
  if (filters.light_condition && filters.light_condition !== "all")
    active.push(`Light: ${filters.light_condition}`);
  if (filters.collision_type && filters.collision_type !== "all")
    active.push(`Collision: ${filters.collision_type}`);

  return (
    <div className="border-t border-[#F1F4FB] px-3 py-2 bg-[#F7F9FD]">
      {active.length === 0 ? (
        <p className="text-[10px] text-[#9BA3C2]">
          All records will be exported (no filters applied)
        </p>
      ) : (
        <>
          <p className="text-[10px] font-semibold text-[#6B7299] mb-1">
            Active filters:
          </p>
          <div className="flex flex-wrap gap-1">
            {active.map((f) => (
              <span
                key={f}
                className="inline-block rounded-full bg-[#1e3a8a]/10 px-2 py-0.5 text-[10px] font-medium text-[#1e3a8a]"
              >
                {f}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
