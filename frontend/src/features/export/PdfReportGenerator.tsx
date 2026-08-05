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

import React, { useEffect, useState, useMemo, useCallback } from "react";
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
  onError: _onError,
}) => {
  const [_progress, setProgress] = useState<string>("Initializing...");
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
    
    // Wait briefly for Recharts layout calculations (animations are disabled in CSS)
    const timer = setTimeout(() => {
      setProgress("Opening print dialog...");
      
      // Immediately hide loading overlay BEFORE window.print() opens
      const overlay = document.getElementById('pdf-loading-overlay');
      if (overlay) {
        overlay.style.display = 'none';
      }

      // Give browser 50ms to repaint without overlay before opening blocking print dialog
      setTimeout(() => {
        window.print();
      }, 50);
    }, 2000);

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
  if (filters.date_from) filterStrs.push(`Date From: ${filters.date_from}`);
  if (filters.date_to) filterStrs.push(`Date To: ${filters.date_to}`);
  if (filters.year?.length) filterStrs.push(`Year: ${filters.year.join(", ")}`);
  if (filters.month?.length) filterStrs.push(`Month: ${filters.month.join(", ")}`);
  if (filters.day?.length) filterStrs.push(`Day: ${filters.day.join(", ")}`);
  if (filters.time_period?.length) filterStrs.push(`Time: ${filters.time_period.join(", ")}`);
  if (filters.taluka?.length) filterStrs.push(`Taluka: ${filters.taluka.join(", ")}`);
  if (filters.police_station?.length) filterStrs.push(`Police Station: ${filters.police_station.join(", ")}`);
  if (filters.severity?.length) filterStrs.push(`Severity: ${filters.severity.join(", ")}`);
  if (filters.road_classification?.length) filterStrs.push(`Road Type: ${filters.road_classification.join(", ")}`);
  if (filters.weather_condition?.length) filterStrs.push(`Weather: ${filters.weather_condition.join(", ")}`);
  if (filters.light_condition?.length) filterStrs.push(`Light Condition: ${filters.light_condition.join(", ")}`);
  if (filters.collision_type?.length) filterStrs.push(`Collision Type: ${filters.collision_type.join(", ")}`);

  const statFilters = useMemo(
    () => ({
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
    }),
    [
      actualDistrict,
      filters.year?.join(","),
      filters.date_from,
      filters.date_to,
      filters.severity?.join(","),
      (filters as any).road_classification?.join(","),
      filters.weather_condition?.join(","),
      filters.light_condition?.join(","),
      (filters as any).collision_type?.join(","),
      (filters as any).taluka?.join(","),
      (filters as any).police_station?.join(","),
    ]
  );

  const temporalFetchFn = useCallback(
    (f: any) => fetchGujaratTemporalAnalysis(f, actualDistrict),
    [actualDistrict]
  );

  return createPortal(
    <>
      <style>{`
        /* ── CRITICAL: Force browsers to print background colors ── */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        /* ── Disable Recharts animations in print container ── */
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
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 2mm !important;
            z-index: auto !important;
            box-shadow: none !important;
            background: white !important;
          }
          
          body {
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 3mm 4mm;
          }

          /* Ensure Recharts containers use full component heights in print */
          .print-report-container .recharts-responsive-container {
            width: 100% !important;
            height: 100% !important;
          }

          /* Keep full-width charts single column */
          .print-report-container .grid-cols-1:not(.xl\\:grid-cols-2):not(.xl\\:grid-cols-4):not(.temporal-kpi-row):not(.temporal-chart-row-two),
          .print-report-container .charts-row--one {
            display: grid !important;
            grid-template-columns: 1fr !important;
            width: 100% !important;
          }

          /* Force 2-column grid for paired chart rows */
          .print-report-container .xl\\:grid-cols-2,
          .print-report-container .charts-row--two,
          .print-report-container .temporal-chart-row-two {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
            width: 100% !important;
          }

          /* Force KPI row for Statistical Analysis (5 cols) */
          .print-report-container .kpi-row,
          .print-report-container .grid-cols-2,
          .print-report-container .md\\:grid-cols-4 {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 6px !important;
          }

          /* Force KPI row for Temporal Analysis (4 cols) */
          .print-report-container .temporal-kpi-row,
          .print-report-container .xl\\:grid-cols-4,
          .print-report-container .sm\\:grid-cols-2 {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 6px !important;
            width: 100% !important;
          }
          
          /* Remove borders and shadows from outer card containers */
          .print-report-container .chart-card,
          .print-report-container .kpi-card,
          .print-report-container .rounded-xl:not(.h-7),
          .print-report-container .rounded-2xl {
            border: none !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .print-report-container .chart-card,
          .print-report-container .kpi-card {
            margin-bottom: 4px !important;
          }

          /* Eliminate excessive empty whitespace below charts */
          .print-report-container .chart-card-body {
            padding: 2px 0 !important;
            height: auto !important;
            display: flex !important;
            flex-direction: column !important;
          }

          .print-report-container .district-statistical-analysis,
          .print-report-container [class*="min-h-"] {
            background: white !important;
            padding: 0 !important;
            gap: 8px !important;
            min-height: 0 !important;
          }

          /* Tighten spacing between stacked rows */
          .print-report-container .space-y-4 > * + * {
            margin-top: 8px !important;
          }

          /* Readable sizing for charts in print mode */
          .print-report-container .h-64 {
            height: 240px !important;
            min-height: 220px !important;
          }

          .print-report-container .h-\\[340px\\] {
            height: 280px !important;
            min-height: 250px !important;
          }

          .page-break {
            page-break-before: always !important;
            break-before: page !important;
          }
          
          .break-inside-avoid,
          .print-report-container .grid > div {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          
          .stat-loading, .stat-empty, .pdf-loading-overlay {
            display: none !important;
          }
          
          /* Typography & Sizing */
          .kpi-card {
            padding: 6px 8px !important;
          }
          
          .kpi-label {
            font-size: 10px !important;
            font-weight: 700 !important;
          }
          
          .kpi-value {
            font-size: 20px !important;
            margin-top: 1px !important;
          }
          
          .kpi-sub {
            font-size: 9px !important;
          }
          
          .chart-card-header {
            font-size: 12px !important;
            font-weight: 700 !important;
            color: #1e293b !important;
            letter-spacing: 0.025em !important;
            margin-bottom: 8px !important;
          }
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
            padding: 6px 4px !important;
          }
        }
      `}</style>

      {/* The visible loading overlay */}
      <div id="pdf-loading-overlay" className="pdf-loading-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all duration-300">
          <div className="relative w-[360px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_rgba(8,_112,_184,_0.2)] ring-1 ring-slate-900/5">
            {/* Animated top gradient line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 opacity-90" />
            
            {/* Background decorative blobs */}
            <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

            <div className="relative p-6">
              {/* Loader animation */}
              <div className="mb-5 flex justify-center">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
                  <div className="absolute inset-0 rounded-full border-[3px] border-blue-600 border-t-transparent animate-spin" />
                  <div className="absolute inset-2 rounded-full border-[3px] border-slate-100" />
                  <div className="absolute inset-2 rounded-full border-[3px] border-cyan-400 border-b-transparent animate-[spin_1.5s_linear_infinite_reverse]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-bold tracking-tight text-slate-800">
                  Generating Report
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Gathering insights and rendering analytics...
                </p>
              </div>

              <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-indigo-50/50 p-3 text-xs text-indigo-700 ring-1 ring-indigo-100/80">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="leading-relaxed">
                  The print dialog will open automatically. Please select <strong>Save as PDF</strong> as your destination.
                </span>
              </div>
            </div>
          </div>
        </div>

      {/* The print content container formatted for standard A4 Portrait */}
      <div 
        className="print-report-container fixed top-0 left-0 bg-white text-slate-800"
        style={{
          width: '100%',
          maxWidth: '1000px',
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
            filters={statFilters} 
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
            fetchFn={temporalFetchFn}
            onDataLoaded={() => setTempLoaded(true)} 
            isExport={true}
          />
        </div>
      </div>
    </>,
    document.body
  );
};

