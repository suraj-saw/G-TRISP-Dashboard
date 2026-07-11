import React from "react";

export interface ReportSectionConfig {
  id: string;
  title: string;
  component: React.FC<{ data: any }>;
  group: "statistical" | "temporal";
}

export class ReportRegistry {
  private static sections: ReportSectionConfig[] = [];

  public static register(section: ReportSectionConfig) {
    // Prevent duplicate registrations during hot reloads
    if (!this.sections.find(s => s.id === section.id)) {
      this.sections.push(section);
    }
  }

  public static getSections(group: "statistical" | "temporal"): ReportSectionConfig[] {
    return this.sections.filter(s => s.group === group);
  }

  public static getAllSections(): ReportSectionConfig[] {
    return this.sections;
  }
}
