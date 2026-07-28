/**
 * @file PdfReportGenerator.tsx
 * @description React component responsible for orchestrating the generation of PDF reports using native browser print.
 * It fetches necessary statistical and temporal data, renders a print-only layout, and triggers window.print().
 * 
 * Main Responsibilities:
 * - Data Fetching: Retrieve district stats and temporal analysis data.
 * - Print Layout: Render charts and tables in a specialized hidden layout optimized for printing.
 * - Print Trigger: Automatically invoke the browser's print dialog once the layout is ready.
 * - UI Feedback: Display a loading overlay with progress status during generation.
 */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ReportRegistry } from "./ReportRegistry";
import {
  getDistrictStats,
  fetchGujaratTemporalAnalysis,
} from "../../api/gujaratDashboardApi";
import type { DashboardFilters } from "../../types/dashboard";

/**
 * Props for PdfReportGenerator component
 */
interface PdfReportGeneratorProps {
  /** Dashboard filters to apply to the report data */
  filters: DashboardFilters;
  /** Optional district name to override filter value */
  districtName?: string;
  /** Callback fired when PDF generation completes successfully or user cancels */
  onComplete: () => void;
  /** Callback fired when an error occurs during data fetching */
  onError: (msg: string) => void;
}

export const PdfReportGenerator: React.FC<PdfReportGeneratorProps> = ({
  filters,
  districtName,
  onComplete,
  onError,
}) => {
  const [progress, setProgress] = useState<string>("Initializing...");
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
    if (!dataLoaded) return;

    setProgress("Preparing print layout...");
    
    // Wait for Recharts to render initial animations before printing
    const timer = setTimeout(() => {
      setProgress("Opening print dialog...");
      window.print();
    }, 800);

    const handleAfterPrint = () => {
      // The user closed the print dialog (either printed or cancelled)
      onComplete();
    };

    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [dataLoaded, onComplete]);

  const actualDistrict = districtName || filters.district?.[0] || "";
  const districtStr = actualDistrict ? actualDistrict : "All Gujarat";
  const dateStr = new Date().toLocaleString();
  const filterStrs: string[] = [];
  if (filters.year?.length) filterStrs.push(`Year: ${filters.year.join(", ")}`);
  if (filters.severity?.length) filterStrs.push(`Severity: ${filters.severity.join(", ")}`);

  return createPortal(
    <>
      <style>{`
        @media print {
          /* Hide everything in the body EXCEPT our print container */
          body > *:not(.print-report-container) {
            display: none !important;
          }
          /* Bring the print container back onto the screen for printing */
          .print-report-container {
            position: relative !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }
          /* Ensure the background is white for printing */
          body {
            background-color: white !important;
          }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          /* Helper classes for printing */
          .page-break {
            page-break-before: always;
          }
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* The visible loading overlay (hidden during print) */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center print:hidden"
        style={{
          background: "rgba(255,255,255,0.60)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <div className="w-[370px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="h-1 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400" />
          <div className="px-6 py-5">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <div className="h-8 w-8 rounded-full border-[3px] border-blue-200 border-t-blue-600 animate-spin" />
              </div>
            </div>
            <h2 className="mt-4 text-center text-xl font-bold text-slate-800">
              Exporting PDF Report
            </h2>
            <p className="mt-1 text-center text-sm text-slate-500">
              Please wait while your report is being prepared.
            </p>
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
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-400 animate-pulse" />
              </div>
            </div>
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-700">
              The print dialog will open automatically. Please save as PDF.
            </div>
          </div>
        </div>
      </div>

      {/* The print content (rendered off-screen, moved on-screen during print) */}
      {dataLoaded && (
        <div 
          className="print-report-container absolute bg-white z-[10000] text-slate-800"
          style={{
            top: '-9999px',
            left: '-9999px',
            width: '1024px', // Fixed width so Recharts has a defined width to render against
          }}
        >
          
          {/* Header (Formerly Cover Page) */}
          <div className="flex flex-col justify-center items-center text-center p-8 mb-4">
            <div className="w-full bg-blue-900 text-white p-6 rounded-t-xl">
              <h1 className="text-4xl font-bold mb-2">Government Road Accident Analysis Report</h1>
            </div>
            <div className="w-full bg-slate-50 p-6 border border-slate-200 rounded-b-xl shadow-sm flex flex-row justify-between items-center">
              <div className="text-left">
                <h3 className="text-xl font-bold text-slate-700">District: <span className="text-blue-700">{districtStr}</span></h3>
                <p className="text-slate-500 font-medium text-sm">Generated On: {dateStr}</p>
              </div>
              
              {filterStrs.length > 0 && (
                <div className="text-right text-sm">
                  <h4 className="font-bold text-blue-900">Filters Applied:</h4>
                  <p className="text-slate-700 font-medium">
                    {filterStrs.join(" | ")}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Statistical Sections */}
          {ReportRegistry.getSections("statistical").length > 0 && (
            <div className="px-8 mb-8">
              <div className="border-b-2 border-blue-900 pb-2 mb-6">
                <h2 className="text-2xl font-bold text-blue-900">Section 1 - Statistical Analysis</h2>
              </div>
              <div className="flex flex-col gap-6">
                {ReportRegistry.getSections("statistical").map((section) => (
                  <div 
                    key={section.id} 
                    className="break-inside-avoid w-full flex flex-col"
                  >
                    <div className="w-full">
                      {React.createElement(section.component, {
                        data: statisticalData,
                      })}
                    </div>
                    <div className="text-center mt-3">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{section.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Temporal Sections */}
          {ReportRegistry.getSections("temporal").length > 0 && (
            <div className="px-8 page-break">
              <div className="border-b-2 border-blue-900 pb-2 mb-6">
                <h2 className="text-2xl font-bold text-blue-900">Section 2 - Temporal Analysis</h2>
              </div>
              <div className="flex flex-col gap-6">
                {ReportRegistry.getSections("temporal").map((section) => (
                  <div 
                    key={section.id} 
                    className="break-inside-avoid w-full flex flex-col"
                  >
                    <div className="w-full">
                      {React.createElement(section.component, {
                        data: temporalData,
                      })}
                    </div>
                    <div className="text-center mt-3">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{section.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
};

