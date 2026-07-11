import React from "react";
import ExportButton from "../layout/ExportButton";
import BlackspotExportButton from "../layout/BlackspotExportButton";
import type { DashboardFilters } from "../../types/dashboard";

export type AnalysisView = "spatial" | "statistical" | "temporal";

interface DistrictAnalysisTabsProps {
  activeView: AnalysisView;
  onViewChange: (view: AnalysisView) => void;
  filters: DashboardFilters;
  districtName?: string;
  isBlackspotDetection?: boolean;
  isDbscanBlackspot?: boolean;
  isPedestrianVariant?: boolean;
}

const tabs: { id: AnalysisView; label: string; icon: string }[] = [
  {
    id: "spatial",
    label: "Spatial Analysis",
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.75A1.75 1.75 0 1 1 8 4.25a1.75 1.75 0 0 1 0 3.5z" fill="currentColor"/>
    </svg>`,
  },
  {
    id: "statistical",
    label: "Statistical Analysis",
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="9" width="3" height="6" rx="1" fill="currentColor"/>
      <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor"/>
      <rect x="11" y="1" width="3" height="14" rx="1" fill="currentColor"/>
    </svg>`,
  },
  {
    id: "temporal",
    label: "Temporal Analysis",
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
];

const DistrictAnalysisTabs: React.FC<DistrictAnalysisTabsProps> = ({
  activeView,
  onViewChange,
  filters,
  districtName,
  isBlackspotDetection,
  isDbscanBlackspot,
  isPedestrianVariant,
}) => {
  const showBlackspotExport =
    activeView === "spatial" && (isBlackspotDetection || isDbscanBlackspot);

  return (
    <div className="district-analysis-tabs">
      <div
        className="tabs-inner"
        role="tablist"
        aria-label="District analysis view"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeView === tab.id ? " tab-btn--active" : ""}`}
            onClick={() => onViewChange(tab.id)}
            aria-selected={activeView === tab.id}
            role="tab"
          >
            <span
              className="tab-icon"
              dangerouslySetInnerHTML={{ __html: tab.icon }}
            />
            <span className="tab-label">{tab.label}</span>
            {activeView === tab.id && <span className="tab-indicator" />}
          </button>
        ))}
      </div>

      {activeView !== "spatial" && (
        <div className="ml-auto h-full flex items-center py-1">
          <ExportButton filters={filters} districtName={districtName} />
        </div>
      )}

      {showBlackspotExport && (
        <div className="ml-auto h-full flex items-center py-1">
          <BlackspotExportButton
            filters={filters}
            algorithm={isDbscanBlackspot ? "dbscan" : "greedy"}
            isSurat={false}
            districtName={districtName}
          />
        </div>
      )}

      <style>{`
        .district-analysis-tabs {
          display: flex;
          align-items: center;
          border-bottom: 1px solid #e4e8f4;
          background: #ffffff;
          padding: 0 12px;
          margin-bottom: 0;
          flex-shrink: 0;
        }

        .tabs-inner {
          display: flex;
          gap: 2px;
          position: relative;
        }

        .tab-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 10px 18px 11px;
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7299;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: color 0.18s ease;
          white-space: nowrap;
          outline: none;
          border-radius: 4px 4px 0 0;
        }

        .tab-btn:hover:not(.tab-btn--active) {
          color: #1e3a8a;
          background: #f1f4fb;
        }

        .tab-btn--active {
          color: #1e3a8a;
          font-weight: 600;
        }

        .tab-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          opacity: 0.85;
        }

        .tab-indicator {
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: #1e3a8a;
          border-radius: 2px 2px 0 0;
        }
      `}</style>
    </div>
  );
};

export default DistrictAnalysisTabs;
