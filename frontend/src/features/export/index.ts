/**
 * @file index.ts
 * @description Entry point for the export feature module. 
 * Automatically initializes the report registry by importing the statistical and temporal section definitions.
 * @responsibility Re-exports the primary components and registry to the rest of the application.
 */
// Initialize registry
import "./StatisticalSections";
import "./TemporalSections";

export { PdfReportGenerator } from "./PdfReportGenerator";
export { ReportRegistry } from "./ReportRegistry";
