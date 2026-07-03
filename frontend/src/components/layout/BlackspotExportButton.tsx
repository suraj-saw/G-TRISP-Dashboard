// frontend/src/components/layout/BlackspotExportButton.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  AlertCircle,
  MapPin,
} from "lucide-react";
import {
  downloadBlackspotExport,
  type BlackspotExportFormat,
  type BlackspotAlgorithm,
} from "../../api/blackspotExportApi";
import type { DashboardFilters } from "../../types/dashboard";

interface Props {
  filters: DashboardFilters;
  algorithm: BlackspotAlgorithm;
  isSurat?: boolean;
  districtName?: string;
}

type Status = "idle" | "loading" | "success" | "error";

interface MenuPos {
  top: number;
  left: number;
  width: number;
}

export default function BlackspotExportButton({
  filters,
  algorithm,
  isSurat = true,
  districtName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [bsIdInput, setBsIdInput] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top - 8, left: rect.left, width: rect.width });
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

  useEffect(() => {
    if (status === "success" || status === "error") {
      const t = setTimeout(() => {
        setStatus("idle");
        setErrorMsg(null);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const parsedBsId = bsIdInput.trim() === "" ? undefined : parseInt(bsIdInput, 10);
  const isValidBsId = parsedBsId === undefined || (!isNaN(parsedBsId) && parsedBsId >= 1);

  const handleExport = async (format: BlackspotExportFormat) => {
    if (!isValidBsId) return;
    setOpen(false);
    setStatus("loading");
    setErrorMsg(null);
    try {
      await downloadBlackspotExport(
        filters,
        format,
        algorithm,
        isSurat,
        districtName,
        parsedBsId
      );
      setStatus("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed.";
      setErrorMsg(msg);
      setStatus("error");
    }
  };

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
            <MapPin size={13} />
            Export Blackspots
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

  const algorithmLabel = algorithm === "dbscan" ? "DBSCAN" : "Greedy";
  const exportLabel =
    parsedBsId !== undefined
      ? `Blackspot #${parsedBsId} accidents`
      : "All blackspot accidents";

  return (
    <div className="relative w-full">
      {status === "error" && errorMsg && (
        <p className="mb-1.5 text-[10px] text-red-500 px-1 leading-snug">
          {errorMsg}
        </p>
      )}

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

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              bottom: window.innerHeight - pos.top,
              left: pos.left,
              width: Math.max(pos.width, 220),
              zIndex: 9999,
            }}
            className="rounded-xl border border-[#E4E8F4] bg-white shadow-[0_-8px_32px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[#F1F4FB] bg-[#F7F9FD]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7299]">
                {algorithmLabel} Blackspot Export
              </p>
            </div>

            {/* Blackspot Number Input */}
            <div className="px-3 py-2.5 border-b border-[#F1F4FB]">
              <label className="block text-[10px] font-semibold text-[#6B7299] mb-1.5">
                Blackspot # <span className="font-normal text-[#9BA3C2]">(leave empty for all)</span>
              </label>
              <input
                type="number"
                min={1}
                value={bsIdInput}
                onChange={(e) => setBsIdInput(e.target.value)}
                placeholder="e.g. 1, 2, 3..."
                className="w-full rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 text-[12px] text-[#1A1D2E] placeholder-[#B0B8D1] outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]/20 transition"
              />
              {bsIdInput.trim() !== "" && !isValidBsId && (
                <p className="text-[10px] text-red-500 mt-1">
                  Enter a valid number ≥ 1
                </p>
              )}
            </div>

            {/* Download description */}
            <div className="px-3 py-1.5 bg-[#FAFBFE]">
              <p className="text-[10px] text-[#6B7299]">
                Download: <span className="font-semibold text-[#1A1D2E]">{exportLabel}</span>
              </p>
            </div>

            <div className="p-1.5 flex flex-col gap-1">
              <button
                type="button"
                disabled={!isValidBsId}
                onClick={() => handleExport("csv")}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1A1D2E] hover:bg-[#EEF2FB] hover:text-[#1e3a8a] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-orange-50 shrink-0">
                  <FileText size={16} className="text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-[12px]">CSV File</p>
                  <p className="text-[10px] text-[#9BA3C2]">
                    Accident details with all columns
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={!isValidBsId}
                onClick={() => handleExport("excel")}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1A1D2E] hover:bg-[#EEF2FB] hover:text-[#1e3a8a] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-50 shrink-0">
                  <FileSpreadsheet size={16} className="text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-[12px]">Excel (.xlsx)</p>
                  <p className="text-[10px] text-[#9BA3C2]">
                    Styled with summary sheet
                  </p>
                </div>
              </button>
            </div>

            <div className="border-t border-[#F1F4FB] px-3 py-2 bg-[#F7F9FD]">
              <p className="text-[10px] text-[#9BA3C2]">
                Algorithm:{" "}
                <span className="font-semibold text-[#6B7299]">
                  {algorithmLabel}
                </span>
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
