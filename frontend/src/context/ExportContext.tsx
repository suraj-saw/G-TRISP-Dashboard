import { createContext, useContext, useState, type ReactNode, useCallback } from "react";

export type SupportedFormat = "csv" | "excel" | "png" | "pdf";

export interface ExportConfig {
  supportedFormats: SupportedFormat[];
  allowClusterSelection?: boolean;
  onExport: (format: SupportedFormat, options?: { clusterId?: number }) => Promise<void>;
}

interface ExportContextValue {
  exportConfig: ExportConfig | null;
  registerExportHandler: (config: ExportConfig | null) => void;
}

const ExportContext = createContext<ExportContextValue | null>(null);

export function ExportProvider({ children }: { children: ReactNode }) {
  const [exportConfig, setExportConfig] = useState<ExportConfig | null>(null);

  const registerExportHandler = useCallback((config: ExportConfig | null) => {
    setExportConfig(config);
  }, []);

  return (
    <ExportContext.Provider value={{ exportConfig, registerExportHandler }}>
      {children}
    </ExportContext.Provider>
  );
}

export function useExportContext() {
  const context = useContext(ExportContext);
  if (!context) {
    throw new Error("useExportContext must be used within an ExportProvider");
  }
  return context;
}
