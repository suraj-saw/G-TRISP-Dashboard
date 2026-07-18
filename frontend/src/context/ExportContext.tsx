import { createContext, useContext, useState, type ReactNode, useCallback } from "react";

/** Supported export formats */
export type SupportedFormat = "csv" | "excel" | "png" | "pdf";

/**
 * Configuration object for export functionality
 */
export interface ExportConfig {
  /** List of supported export formats for this component */
  supportedFormats: SupportedFormat[];
  /** Whether to allow selecting specific clusters for export (optional) */
  allowClusterSelection?: boolean;
  /** Callback function to execute the export */
  onExport: (format: SupportedFormat, options?: { clusterId?: number }) => Promise<void>;
}

/**
 * Type for the ExportContext value
 */
interface ExportContextValue {
  /** Current registered export configuration */
  exportConfig: ExportConfig | null;
  /** Function to register/unregister an export handler */
  registerExportHandler: (config: ExportConfig | null) => void;
}

/**
 * React context for managing export state and handlers across components
 */
const ExportContext = createContext<ExportContextValue | null>(null);

/**
 * Provider component for ExportContext
 * @param children - React children to wrap with the provider
 */
export function ExportProvider({ children }: { children: ReactNode }) {
  /** Current export configuration state */
  const [exportConfig, setExportConfig] = useState<ExportConfig | null>(null);

  /**
   * Register or unregister an export handler
   * @param config - Export configuration to register, or null to unregister
   */
  const registerExportHandler = useCallback((config: ExportConfig | null) => {
    setExportConfig(config);
  }, []);

  return (
    <ExportContext.Provider value={{ exportConfig, registerExportHandler }}>
      {children}
    </ExportContext.Provider>
  );
}

/**
 * Hook to access the ExportContext
 * @returns The export context value
 * @throws Error if used outside of ExportProvider
 */
export function useExportContext() {
  const context = useContext(ExportContext);
  if (!context) {
    throw new Error("useExportContext must be used within an ExportProvider");
  }
  return context;
}
