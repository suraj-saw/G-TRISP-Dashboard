// frontend/src/features/dashboard/district/SpatialExportRegistrar.tsx

import { useEffect } from "react";
import { useExportContext } from "../../../context/ExportContext";
import { downloadGujaratExport } from "../../../api/exportApi";
import type { DashboardFilters } from "../../../types/dashboard";

interface SpatialExportRegistrarProps {
  analysisView: string;
  isBlackspotDetection: boolean;
  filters: DashboardFilters;
  districtName: string;
  mapRef?: any;
}

export function SpatialExportRegistrar({
  analysisView,
  isBlackspotDetection,
  filters,
  districtName,
}: SpatialExportRegistrarProps) {
  const { registerExportHandler } = useExportContext();

  useEffect(() => {
    if (analysisView === "spatial") {
      if (isBlackspotDetection) {
        registerExportHandler({
          supportedFormats: ["csv", "excel"],
          allowClusterSelection: true,
          onExport: async (format, options) => {
            if (format === "csv" || format === "excel") {
              await downloadGujaratExport(
                filters,
                format,
                districtName,
                isBlackspotDetection,
                options?.clusterId
              );
            }
          },
        });
      } else {
        registerExportHandler({
          supportedFormats: ["csv", "excel"],
          onExport: async (format) => {
            if (format === "csv" || format === "excel") {
              await downloadGujaratExport(filters, format, districtName);
            }
          },
        });
      }
    } else {
      registerExportHandler(null);
    }
  }, [
    analysisView,
    isBlackspotDetection,
    filters,
    districtName,
    registerExportHandler,
  ]);

  return null;
}
