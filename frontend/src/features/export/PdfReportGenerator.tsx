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
import type { DashboardFilters } from "../../types/dashboard";
import DistrictStatisticalAnalysis from "../../components/dashboard/DistrictStatisticalAnalysis";
import TemporalAnalysis from "../../components/temporal/TemporalAnalysis";
import { fetchGujaratTemporalAnalysis } from "../../api/gujaratDashboardApi";

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
  const [statLoaded, setStatLoaded] = useState(false);
  const [tempLoaded, setTempLoaded] = useState(false);

  // We consider it "data loaded" when BOTH components report they are done
  const dataLoaded = statLoaded && tempLoaded;

  useEffect(() => {
    if (!dataLoaded) {
      setProgress("Fetching data...");
      return;
    }

    setProgress("Preparing print layout...");
    
    // Wait for Recharts animations to fully complete (pie charts take longer)
    const timer = setTimeout(() => {
      setProgress("Opening print dialog...");
      window.print();
    }, 4000);

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
        /* ── CRITICAL: Force browsers to print background colors ── */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        /* ── Force 1-column layout BEFORE print (so Recharts renders full-width SVGs) ── */
        .print-report-container .charts-row--two,
        .print-report-container .xl\\:grid-cols-2 {
          grid-template-columns: 1fr !important;
          display: grid !important;
        }
        
        /* ── Disable Recharts animations in print container (pie chart fix) ── */
        .print-report-container .recharts-pie-sector,
        .print-report-container .recharts-bar-rectangle,
        .print-report-container .recharts-line,
        .print-report-container .recharts-area {
          animation: none !important;
          transition: none !important;
        }

        @media print {
          body > *:not(.print-report-container) {
            display: none !important;
          }
          
          .print-report-container {
            position: static !important;
            overflow: visible !important;
            width: 100% !important;
            z-index: auto !important;
          }
          
          body {
            background-color: white !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          
          /* Remove borders, shadows from containers */
          .chart-card, .kpi-card {
            border: none !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          
          .print-report-container .rounded-xl {
            border: none !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Move chart titles below the chart */
          .chart-card {
            display: flex !important;
            flex-direction: column-reverse !important;
          }
          
          .chart-card-header {
            text-align: center !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            color: #64748b !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
            margin-top: 8px !important;
            margin-bottom: 0 !important;
            border-bottom: none !important;
            background: transparent !important;
            padding: 2px 0 !important;
          }

          .page-break {
            page-break-before: always;
          }
          
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          
          .stat-loading, .stat-empty {
            display: none !important;
          }
          
          .pdf-loading-overlay {
            display: none !important;
          }
          
          /* Compact KPIs for print */
          .district-statistical-analysis {
            background: white !important;
            padding: 0 !important;
            gap: 12px !important;
          }
          
          .kpi-card {
            padding: 8px 12px !important;
          }
          
          .kpi-label {
            font-size: 9px !important;
          }
          
          .kpi-value {
            font-size: 18px !important;
            margin-top: 2px !important;
          }
          
          .kpi-sub {
            font-size: 9px !important;
          }
          
          .kpi-row {
            gap: 8px !important;
          }
          
          .charts-row {
            gap: 8px !important;
          }
          
          /* Center Recharts SVGs */
          .recharts-wrapper {
            margin: 0 auto !important;
          }
          
          /* Compact chart card body */
          .chart-card-body {
            padding: 8px 4px !important;
          }
        }
      `}</style>

      {/* The visible loading overlay */}
      <div className="pdf-loading-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-white/95 backdrop-blur-sm">
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

      {/* The print content — wider container for better chart rendering */}
      <div 
        className="print-report-container fixed top-0 left-0 bg-white text-slate-800"
        style={{
          width: '794px',
          zIndex: -1,
          overflowY: 'auto',
          height: '100vh',
        }}
      >
        
        {/* Professional Header */}
        <div style={{ margin: '16px 12px 24px', paddingBottom: '16px', borderBottom: '3px solid #1e3a5f', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1e3a5f', margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em' }}>G-TRISP Analytics</h1>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', margin: '4px 0 0 0' }}>Road Accident Statistical & Temporal Report</h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: 0 }}>
              District: <span style={{ color: '#2563eb' }}>{districtStr}</span>
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>Generated On: {dateStr}</p>
          </div>
        </div>

        {/* Filters Banner */}
        {filterStrs.length > 0 && (
          <div style={{ margin: '0 12px 20px', padding: '10px 14px', background: '#f8fafc', borderLeft: '4px solid #2563eb', borderRadius: '0 6px 6px 0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginRight: '8px' }}>Filters Applied: </span>
            <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 500 }}>{filterStrs.join("  •  ")}</span>
          </div>
        )}

        {/* Statistical Sections */}
        <div style={{ padding: '0 12px', marginBottom: '16px' }}>
          <div style={{ borderBottom: '2px solid #1e3a5f', paddingBottom: '4px', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1e3a5f', margin: 0 }}>Section 1 - Statistical Analysis</h2>
          </div>
          <DistrictStatisticalAnalysis 
            filters={{
              district: actualDistrict,
              year: filters.year?.map(String),
              startDate: filters.date_from,
              endDate: filters.date_to,
              severity: filters.severity,
              roadClassification: (filters as any).road_classification,
              weatherCondition: filters.weather_condition,
              lightCondition: filters.light_condition,
              collisionType: (filters as any).collision_type,
              taluka: (filters as any).taluka,
              policeStation: (filters as any).police_station,
            }} 
            onDataLoaded={() => setStatLoaded(true)}
            disableAnimations={true}
            fullLabels={true}
          />
        </div>

        {/* Temporal Sections */}
        <div className="page-break" style={{ padding: '0 12px' }}>
          <div style={{ borderBottom: '2px solid #1e3a5f', paddingBottom: '4px', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1e3a5f', margin: 0 }}>Section 2 - Temporal Analysis</h2>
          </div>
          <TemporalAnalysis 
            filters={filters as any} 
            fetchFn={(f) => fetchGujaratTemporalAnalysis(f as any, actualDistrict)}
            onDataLoaded={() => setTempLoaded(true)} 
          />
        </div>
      </div>
    </>,
    document.body
  );
};

