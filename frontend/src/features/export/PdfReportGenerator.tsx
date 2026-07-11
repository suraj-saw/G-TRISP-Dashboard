import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { ReportRegistry } from "./ReportRegistry";
import { PdfEngine } from "../../utils/pdfEngine";
import { getDistrictStats, fetchGujaratTemporalAnalysis } from "../../api/gujaratDashboardApi";
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
          fetchGujaratTemporalAnalysis(filters as any, actualDistrict)
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
  }, [filters, onError]);

  useEffect(() => {
    if (!dataLoaded || !containerRef.current) return;

    // Generate PDF once DOM is updated and charts are drawn
    const generatePdf = async () => {
      try {
        setProgress("Generating document...");
        // Wait for Recharts to render (disabled animation is needed on the charts, but adding a delay helps)
        await new Promise((r) => setTimeout(r, 2000));

        const engine = new PdfEngine();

        // 1. Cover Page
        const actualDistrict = districtName || filters.district?.[0] || "";
        const districtStr = actualDistrict ? actualDistrict : "All Gujarat";
        const filterStrs: string[] = [];
        if (filters.year?.length) filterStrs.push(`Year: ${filters.year.join(", ")}`);
        if (filters.severity?.length) filterStrs.push(`Severity: ${filters.severity.join(", ")}`);
        
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
                setProgress(`Rendering Statistical Analysis (${index}/${statSections.length})...`);
                await engine.addElementAsImage(`report-section-${section.id}`, section.title);
                index++;
            }
        }

        // 3. Temporal Analysis
        if (tempSections.length > 0) {
            engine.addNewPage("Section 2 - Temporal Analysis");
            let index = 1;
            for (const section of tempSections) {
                setProgress(`Rendering Temporal Analysis (${index}/${tempSections.length})...`);
                await engine.addElementAsImage(`report-section-${section.id}`, section.title);
                index++;
            }
        }

        engine.save(`${districtStr.toLowerCase().replace(/\s+/g, "_")}_analysis_report.pdf`);
        onComplete();

      } catch (err) {
        console.error(err);
        onError("Failed to generate PDF document.");
      }
    };

    generatePdf();
  }, [dataLoaded, filters, onComplete, onError]);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(255,255,255,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={48} className="animate-spin text-blue-600 mb-4" />
      <h2 className="text-xl font-bold text-slate-800">Exporting PDF Report</h2>
      <p className="text-slate-600 mt-2">{progress}</p>

      {/* Hidden render area for charts */}
      {dataLoaded && (
        <div ref={containerRef} style={{ position: "absolute", top: "-9999px", left: "-9999px", width: "1024px", background: "#fff", padding: "20px" }}>
          {ReportRegistry.getSections("statistical").map((section) => (
             <div id={`report-section-${section.id}`} key={section.id} style={{ marginBottom: "20px", padding: "10px", background: "#fff", border: "1px solid #e2e8f0" }}>
                 {React.createElement(section.component, { data: statisticalData })}
             </div>
          ))}
          {ReportRegistry.getSections("temporal").map((section) => (
             <div id={`report-section-${section.id}`} key={section.id} style={{ marginBottom: "20px", padding: "10px", background: "#fff", border: "1px solid #e2e8f0" }}>
                 {React.createElement(section.component, { data: temporalData })}
             </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};
