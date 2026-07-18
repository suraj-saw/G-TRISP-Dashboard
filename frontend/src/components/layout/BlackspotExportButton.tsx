/**
 * @file BlackspotExportButton.tsx
 * @description A complex export button component specifically designed for downloading Blackspot reports (CSV/Excel).
 * @responsibility Renders a dropdown menu via React Portals, captures user input for specific blackspot numbers (including ranges), validates the input, and interfaces with the `blackspotExportApi` to initiate the download.
 * @dependencies lucide-react (icons), downloadBlackspotExport (API).
 */
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

/**
 * BlackspotExportButton Component
 * @state_management Maintains UI states (`open`, `status`), handles form validation state (`bsIdsInput`), and manages the absolute positioning (`pos`) of the portaled dropdown.
 * @param {Object} props - Component properties.
 * @param {DashboardFilters} props.filters - Global dashboard filters applied to the export.
 * @param {BlackspotAlgorithm} props.algorithm - The blackspot detection algorithm used (e.g. 'dbscan', 'greedy').
 * @param {boolean} [props.isSurat=true] - Flag indicating if the current context is Surat.
 * @param {string} [props.districtName] - Optional district name.
 */
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
  const [bsIdsInput, setBsIdsInput] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left, width: rect.width });
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

  /**
   * Validates the blackspot number input field.
   * @business_rule Supports comma-separated single numbers (e.g., "3") and ranges (e.g., "1-5"). Rejects negative numbers or invalid ranges where start > end.
   * @param {string} input - The raw string input from the user.
   * @returns {{valid: boolean, message?: string}} Validation result object.
   */
  const validateInput = (
    input: string
  ): { valid: boolean; message?: string } => {
    const trimmed = input.trim();
    if (!trimmed) {
      return { valid: false, message: "Please enter blackspot number(s)" };
    }

    // Split by commas
    const parts = trimmed
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p);
    for (const part of parts) {
      if (part.includes("-")) {
        // Range, e.g. "1-5"
        const rangeParts = part
          .split("-")
          .map((rp) => rp.trim())
          .filter((rp) => rp);
        if (rangeParts.length !== 2) {
          return {
            valid: false,
            message: "Invalid range format (use e.g. 1-5)",
          };
        }
        const start = parseInt(rangeParts[0], 10);
        const end = parseInt(rangeParts[1], 10);
        if (isNaN(start) || isNaN(end) || start < 1 || end < 1 || start > end) {
          return {
            valid: false,
            message: "Invalid range (start must be ≤ end and ≥ 1)",
          };
        }
      } else {
        // Single number
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 1) {
          return { valid: false, message: "Invalid number (must be ≥ 1)" };
        }
      }
    }
    return { valid: true };
  };

  const validation = validateInput(bsIdsInput);

  /**
   * Initiates the export process for the specified format.
   * @param {BlackspotExportFormat} format - Target export format ("csv" or "excel").
   */
  const handleExport = async (format: BlackspotExportFormat) => {
    if (!validation.valid) return;
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
        bsIdsInput
      );
      setStatus("success");
      setBsIdsInput("");
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
  const exportLabel = bsIdsInput.trim()
    ? `Blackspot(s) ${bsIdsInput.trim()} accidents`
    : "Please enter blackspot number(s)";

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
              top: pos.top + triggerRef.current!.offsetHeight + 8,
              left: Math.min(
                pos.left,
                window.innerWidth - Math.max(pos.width, 220) - 16
              ),
              width: Math.max(pos.width, 220),
              zIndex: 9999,
            }}
            className="rounded-xl border border-[#E4E8F4] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[#F1F4FB] bg-[#F7F9FD]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7299]">
                {algorithmLabel} Blackspot Export
              </p>
            </div>

            {/* Blackspot Number Input */}
            <div className="px-3 py-2.5 border-b border-[#F1F4FB]">
              <label className="block text-[10px] font-semibold text-[#6B7299] mb-1.5">
                Blackspot #{" "}
                <span className="font-normal text-[#9BA3C2]">
                  (enter number(s); use , for multiple, - for range)
                </span>
              </label>
              <input
                type="text"
                value={bsIdsInput}
                onChange={(e) => setBsIdsInput(e.target.value)}
                placeholder="e.g. 3, 1-5, 2,4-7"
                className="w-full rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 text-[12px] text-[#1A1D2E] placeholder-[#B0B8D1] outline-none focus:border-[#1e3a8a] focus:ring-1 focus:ring-[#1e3a8a]/20 transition"
              />
              {bsIdsInput.trim() !== "" &&
                !validation.valid &&
                validation.message && (
                  <p className="text-[10px] text-red-500 mt-1">
                    {validation.message}
                  </p>
                )}
            </div>

            {/* Download description */}
            <div className="px-3 py-1.5 bg-[#FAFBFE]">
              <p className="text-[10px] text-[#6B7299]">
                Download:{" "}
                <span className="font-semibold text-[#1A1D2E]">
                  {exportLabel}
                </span>
              </p>
            </div>

            <div className="p-1.5 flex flex-col gap-1">
              <button
                type="button"
                disabled={!validation.valid}
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
                disabled={!validation.valid}
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
