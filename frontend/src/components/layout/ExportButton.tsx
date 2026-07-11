// frontend/src/components/layout/ExportButton.tsx
import { useState } from "react";
import { Download } from "lucide-react";
import type { DashboardFilters } from "../../types/dashboard";
import { PdfReportGenerator } from "../../features/export";

interface Props {
  filters: DashboardFilters;
  districtName?: string;
}

export default function ExportButton({ filters, districtName }: Props) {
  const [generating, setGenerating] = useState(false);

  return (
    <div className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        disabled={generating}
        onClick={() => setGenerating(true)}
        className="flex items-center justify-center gap-2 w-full rounded-lg border border-[#E4E8F4] bg-white text-[#1e3a8a] px-4 py-2.5 text-[12px] font-semibold shadow-sm transition hover:border-[#1e3a8a] hover:bg-[#EEF2FB] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Download size={13} />
        Export PDF Report
      </button>

      {/* PDF Generator Modal */}
      {generating && (
        <PdfReportGenerator 
          filters={filters} 
          districtName={districtName}
          onComplete={() => setGenerating(false)}
          onError={(msg) => {
            alert(msg);
            setGenerating(false);
          }}
        />
      )}
    </div>
  );
}

