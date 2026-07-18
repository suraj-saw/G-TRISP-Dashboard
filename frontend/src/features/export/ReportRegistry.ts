import React from "react";

/**
 * Configuration for a report section in the PDF export
 */
export interface ReportSectionConfig {
  /** Unique identifier for the section */
  id: string;
  /** Display title for the section */
  title: string;
  /** React component to render the section content */
  component: React.FC<{ data: any }>;
  /** Group the section belongs to (statistical or temporal) */
  group: "statistical" | "temporal";
}

/**
 * Static registry for managing report sections in the PDF export
 * 
 * Features:
 * - Prevents duplicate section registrations during hot reloads
 * - Retrieves sections by group (statistical or temporal)
 * - Retrieves all registered sections
 */
export class ReportRegistry {
  /** Array of all registered report sections */
  private static sections: ReportSectionConfig[] = [];

  /**
   * Registers a new report section
   * @param section - Configuration for the report section
   */
  public static register(section: ReportSectionConfig) {
    // Prevent duplicate registrations during hot reloads
    if (!this.sections.find(s => s.id === section.id)) {
      this.sections.push(section);
    }
  }

  /**
   * Retrieves all sections for a specific group
   * @param group - The group to filter sections by (statistical or temporal)
   * @returns Array of report sections in the specified group
   */
  public static getSections(group: "statistical" | "temporal"): ReportSectionConfig[] {
    return this.sections.filter(s => s.group === group);
  }

  /**
   * Retrieves all registered report sections
   * @returns Array of all report sections
   */
  public static getAllSections(): ReportSectionConfig[] {
    return this.sections;
  }
}
