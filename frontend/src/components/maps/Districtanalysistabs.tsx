/**
 * @file DistrictAnalysisTabs.tsx
 * @description Renders the tabbed navigation for switching between Spatial, Statistical, and Temporal views in the District Dashboard.
 * @responsibility Displays navigation tabs and conditionally renders appropriate export buttons depending on the active view and feature flags.
 */
import React, { useState } from "react";
import { Camera } from "lucide-react";
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
  searchBar?: React.ReactNode;
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

/**
 * DistrictAnalysisTabs Component
 * @param {Object} props - Component properties.
 * @param {AnalysisView} props.activeView - Currently selected view ("spatial" | "statistical" | "temporal").
 * @param {Function} props.onViewChange - Callback triggered when a tab is clicked.
 * @param {DashboardFilters} props.filters - Global dashboard filters (passed to export buttons).
 */
const DistrictAnalysisTabs: React.FC<DistrictAnalysisTabsProps> = ({
  activeView,
  onViewChange,
  filters,
  districtName,
  isBlackspotDetection,
  isDbscanBlackspot,
  // isPedestrianVariant,
  searchBar,
}) => {
  const showBlackspotExport =
    activeView === "spatial" && (isBlackspotDetection || isDbscanBlackspot);

  const [isExporting, setIsExporting] = useState(false);

  const handleMapScreenshot = () => {
    const map = (window as any)._globalMaplibreMap;
    if (!map) {
      alert('Map is not currently visible or loaded.');
      return;
    }

    if (isExporting) return;
    setIsExporting(true);

    const originalPixelRatio = window.devicePixelRatio;
    // Render at a minimum of 3x resolution for high quality
    const targetPixelRatio = Math.max(originalPixelRatio, 3);
    
    let spoofed = false;
    try {
      Object.defineProperty(window, 'devicePixelRatio', {
        get: () => targetPixelRatio,
        configurable: true
      });
      spoofed = true;
    } catch (e) {
      console.warn('Could not spoof devicePixelRatio for high-res export');
    }

    // Force map to re-allocate its WebGL buffers at the new high resolution
    map.resize();

    let finished = false;
    const capture = () => {
      if (finished) return;
      finished = true;

      try {
        const canvas = map.getCanvas();
        
        // Calculate scaling factor for the header/footer to match the new high-res map
        const scale = targetPixelRatio / originalPixelRatio;
        
        // We don't need to add header/footer height, we draw directly on the map
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const ctx = offscreen.getContext('2d');
        
        if (ctx) {
          // Draw High-Res Map image as the base
          ctx.drawImage(canvas, 0, 0);

          const padding = 28 * scale;

          // Helper to draw text with a readable white halo (standard GIS watermark style)
          const drawHaloText = (text: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign, baseline: CanvasTextBaseline) => {
            ctx.font = font;
            ctx.textAlign = align;
            ctx.textBaseline = baseline;
            
            // Draw halo (white outline)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 5 * scale;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeText(text, x, y);
            
            // Draw text
            ctx.fillStyle = color;
            ctx.fillText(text, x, y);
          };

          // Top Left: Title & Subtitle
          drawHaloText('G-TRISP DASHBOARD', padding, padding, `900 ${26 * scale}px sans-serif`, '#1e3a8a', 'left', 'top');
          if (districtName) {
            drawHaloText(`${districtName.toUpperCase()} DISTRICT`, padding, padding + 34 * scale, `700 ${16 * scale}px sans-serif`, '#334155', 'left', 'top');
          }

          // Bottom Left: Credits
          drawHaloText('Data Analytics by SVNIT Surat', padding, canvas.height - padding, `600 ${14 * scale}px sans-serif`, '#334155', 'left', 'bottom');

          // Bottom Right: Timestamp
          const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
          drawHaloText(timestamp, canvas.width - padding, canvas.height - padding, `500 ${14 * scale}px sans-serif`, '#64748b', 'right', 'bottom');

          // Export as High-Quality PNG
          const dataURL = offscreen.toDataURL('image/png', 1.0);
          const a = document.createElement('a');
          a.href = dataURL;
          a.download = `gtrisp-map-${districtName || 'export'}-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch (err) {
        console.error("Map Export Error:", err);
        alert("An error occurred while generating the map screenshot. Please check the console for details.");
      } finally {
        // Revert devicePixelRatio and resize back to normal
        if (spoofed) {
          Object.defineProperty(window, 'devicePixelRatio', {
            get: () => originalPixelRatio,
            configurable: true
          });
        }
        map.resize();
        setIsExporting(false);
      }
    };

    // Wait for the map to finish loading high-res tiles and become idle
    map.once('idle', capture);
    
    // Fallback timeout in case 'idle' doesn't fire (e.g. if the map was already completely loaded)
    setTimeout(capture, 2500);
  };

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

        {activeView === "spatial" && (
          <button
            className={`screenshot-btn ${isExporting ? 'opacity-70 cursor-not-allowed' : ''}`}
            onClick={handleMapScreenshot}
            title="Take High-Res Map Screenshot"
            aria-label="Take High-Res Map Screenshot"
            disabled={isExporting}
          >
            {isExporting ? (
              <span className="animate-spin text-[#1e3a8a]" style={{ display: 'inline-block', lineHeight: 1 }}>⌛</span>
            ) : (
              <Camera size={16} />
            )}
          </button>
        )}
      </div>

      {activeView !== "spatial" && (
        <div className="ml-4 h-full flex items-center py-1">
          <ExportButton filters={filters} districtName={districtName} />
        </div>
      )}

      {showBlackspotExport && (
        <div className="ml-4 h-full flex items-center py-1">
          <BlackspotExportButton
            filters={filters}
            algorithm={isDbscanBlackspot ? "dbscan" : "greedy"}
            
            districtName={districtName}
          />
        </div>
      )}

      {searchBar && (
        <div className="ml-auto max-w-[320px] w-full px-2 flex items-center">
          {searchBar}
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

        .screenshot-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 14px;
          margin-left: 4px;
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7299;
          transition: all 0.2s ease;
          border-radius: 4px;
          height: 32px;
          align-self: center;
        }

        .screenshot-btn:hover {
          color: #1e3a8a;
          background: #f1f4fb;
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
