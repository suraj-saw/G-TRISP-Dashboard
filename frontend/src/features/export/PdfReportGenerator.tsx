import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
// import { Loader2 } from "lucide-react";
import { ReportRegistry } from "./ReportRegistry";
import { PdfEngine } from "../../utils/pdfEngine";
import {
  getDistrictStats,
  fetchGujaratTemporalAnalysis,
} from "../../api/gujaratDashboardApi";
import type { DashboardFilters } from "../../types/dashboard";

interface PdfReportGeneratorProps {
  filters: DashboardFilters;
  districtName?: string;
  onComplete: () => void;
  onError: (msg: string) => void;
}

export const PdfReportGenerator: React.FC<PdfReportGeneratorProps> = ({
  filters,
  districtName,
  onComplete,
  onError,
}) => {
  const [progress, setProgress] = useState<string>("Initializing...");
  const containerRef = useRef<HTMLDivElement>(null);

  // Data state
  const [statisticalData, setStatisticalData] = useState<any>(null);
  const [temporalData, setTemporalData] = useState<any>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    async function loadData() {
      setProgress("Fetching data...");
      try {
        const actualDistrict = districtName || filters.district?.[0] || "";
        const [stat, temp] = await Promise.all([
          getDistrictStats({ ...filters, district: actualDistrict } as any),
          fetchGujaratTemporalAnalysis(filters as any, actualDistrict),
        ]);
        setStatisticalData(stat);
        setTemporalData(temp);
        setDataLoaded(true);
      } catch (e) {
        console.error(e);
        onError("Failed to load data for report.");
      }
    }
    loadData();
  }, [filters, districtName, onError]);

  useEffect(() => {
    if (!dataLoaded || !containerRef.current) return;

    // Generate PDF once DOM is updated and charts are drawn
    const generatePdf = async () => {
      try {
        setProgress("Generating document...");
        // Wait for Recharts to render (reduced delay for better performance)
        await new Promise((r) => setTimeout(r, 500));

        const engine = new PdfEngine();

        // 1. Cover Page
        const actualDistrict = districtName || filters.district?.[0] || "";
        const districtStr = actualDistrict ? actualDistrict : "All Gujarat";
        const filterStrs: string[] = [];
        if (filters.year?.length)
          filterStrs.push(`Year: ${filters.year.join(", ")}`);
        if (filters.severity?.length)
          filterStrs.push(`Severity: ${filters.severity.join(", ")}`);

        engine.addCoverPage({
          title: "Government Road Accident Analysis Report",
          district: districtStr,
          dateStr: new Date().toLocaleString(),
          filters: filterStrs,
        });

        const statSections = ReportRegistry.getSections("statistical");
        const tempSections = ReportRegistry.getSections("temporal");

        // 2. Statistical Analysis
        if (statSections.length > 0) {
          engine.addNewPage("Section 1 - Statistical Analysis");
          let index = 1;
          for (const section of statSections) {
            setProgress(
              `Capturing Statistical Analysis (${index}/${statSections.length})...`
            );
            // Yield to main thread to prevent UI freeze and aid GC
            await new Promise((r) => setTimeout(r, 50));
            const capture = await engine.captureElement(
              `report-section-${section.id}`
            );
            if (capture) {
              engine.addCapturedImage(capture, section.title);
            }
            index++;
          }
        }

        // 3. Temporal Analysis
        if (tempSections.length > 0) {
          engine.addNewPage("Section 2 - Temporal Analysis");
          let index = 1;
          for (const section of tempSections) {
            setProgress(
              `Capturing Temporal Analysis (${index}/${tempSections.length})...`
            );
            // Yield to main thread to prevent UI freeze
            await new Promise((r) => setTimeout(r, 50));
            const capture = await engine.captureElement(
              `report-section-${section.id}`
            );
            if (capture) {
              engine.addCapturedImage(capture, section.title);
            }
            index++;
          }
        }

        engine.save(
          `${districtStr.toLowerCase().replace(/\s+/g, "_")}_analysis_report.pdf`
        );
        onComplete();
      } catch (err) {
        console.error(err);
        onError("Failed to generate PDF document.");
      }
    };

    generatePdf();
  }, [dataLoaded, filters, districtName, onComplete, onError]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: "rgba(255,255,255,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div className="w-[370px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Top Accent */}
        <div className="h-1 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400" />

        <div className="px-6 py-5">
          {/* Smooth Spinner */}
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <div className="h-8 w-8 rounded-full border-[3px] border-blue-200 border-t-blue-600 animate-spin" />
            </div>
          </div>

          {/* Title */}
          <h2 className="mt-4 text-center text-xl font-bold text-slate-800">
            Exporting PDF Report
          </h2>

          <p className="mt-1 text-center text-sm text-slate-500">
            Please wait while your report is being generated.
          </p>

          {/* Status Card */}
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Current Step
              </span>

              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                Processing
              </span>
            </div>

            <p className="text-sm font-medium text-slate-700">{progress}</p>

            {/* Animated Progress */}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-400 export-progress-bar" />
            </div>
          </div>

          {/* Warning */}
          <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-700">
            Please don't close or refresh this page until the PDF has been
            downloaded.
          </div>
        </div>
      </div>

      {/* Hidden render area */}
      {dataLoaded && (
        <div
          ref={containerRef}
          style={{
            position: "absolute",
            top: "-9999px",
            left: "-9999px",
            width: "1024px",
            background: "#fff",
            padding: "20px",
          }}
        >
          {ReportRegistry.getSections("statistical").map((section) => (
            <div
              id={`report-section-${section.id}`}
              key={section.id}
              style={{
                marginBottom: "20px",
                padding: "10px",
                background: "#fff",
              }}
            >
              {React.createElement(section.component, {
                data: statisticalData,
              })}
            </div>
          ))}

          {ReportRegistry.getSections("temporal").map((section) => (
            <div
              id={`report-section-${section.id}`}
              key={section.id}
              style={{
                marginBottom: "20px",
                padding: "10px",
                background: "#fff",
              }}
            >
              {React.createElement(section.component, {
                data: temporalData,
              })}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};
