/**
 * @file pdfEngine.ts
 * @description Engine for generating professional PDF reports for the G-TRISP Dashboard.
 * Handles the creation of PDF documents, including custom headers, footers, cover pages,
 * and the capture/embedding of HTML elements into the PDF layout.
 * 
 * Main Responsibilities:
 * - Initialize and manage jsPDF instance with A4 dimensions.
 * - Render standardized professional headers and footers.
 * - Build dynamic cover pages based on user-selected filters and metadata.
 * - Capture React DOM elements via html2canvas and embed them into the PDF.
 * - Manage pagination and content flow calculations.
 *
 * Important Dependencies:
 * - jspdf: Core PDF generation library.
 * - html2canvas: Used for converting HTML nodes to canvas images for PDF embedding.
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Options for PDF export configuration.
 * Contains metadata and filter state used to generate the report cover page.
 */
export interface PDFExportOptions {
  /** The main title of the generated report */
  title: string;
  /** The selected district or region name */
  district: string;
  /** Formatted date string indicating when the report was generated */
  dateStr: string;
  /** Array of active filter descriptions (e.g., 'Year: 2023') applied to the data */
  filters: string[];
}

/**
 * Engine for generating professional accident analysis PDF reports.
 * Wraps jsPDF to provide high-level APIs for report structure and layout.
 */
export class PdfEngine {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 20;
  private currentY: number = 30;
  private sectionTitle: string = "";
  private district: string = "";
  private dateStr: string = "";

  /**
   * Initializes the PDF engine with standard A4 portrait settings.
   * Caches page dimensions for layout calculations.
   */
  constructor() {
    this.doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  /**
   * Adds professional header with branding, section title, and district name to the current page.
   * This is typically called internally when a new page is created.
   * 
   * Side Effects: Modifies the jsPDF document state by drawing shapes and text.
   */
  private addHeaderInternal() {
    // Header bar
    this.doc.setFillColor(30, 58, 138); // #1e3a8a
    this.doc.rect(0, 0, this.pageWidth, 12, "F");

    // G-TRISP branding
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text("G-TRISP Dashboard", 10, 8);

    // Section title
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.doc.text(this.sectionTitle, this.pageWidth / 2, 8, {
      align: "center",
    });

    // District name right
    this.doc.text(this.district, this.pageWidth - 10, 8, { align: "right" });
  }

  /**
   * Adds professional footer with generation date and page number to the current page.
   * Ensures consistent branding and pagination at the bottom of each page.
   * 
   * Side Effects: Modifies the jsPDF document state by drawing shapes and text.
   */
  private addFooterInternal() {
    const pageCount = this.doc.getNumberOfPages();
    // const totalPages = this.doc.getNumberOfPages();
    const pageText = `Page ${pageCount}`;

    // Footer bar
    this.doc.setFillColor(248, 250, 252); // #f8fafc
    this.doc.rect(0, this.pageHeight - 12, this.pageWidth, 12, "F");

    // Footer text
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.doc.setTextColor(100, 116, 139);
    this.doc.text(`Generated: ${this.dateStr}`, 10, this.pageHeight - 5);
    this.doc.text(pageText, this.pageWidth - 10, this.pageHeight - 5, {
      align: "right",
    });
  }

  /**
   * Adds the professional cover page to the document.
   * This builds a complex layout including a large title, district information,
   * generation date, and a list of applied filters.
   * 
   * @param options - Export options containing title, district, date, and filters
   * 
   * Layout Logic:
   * Uses vertical cursor tracking (`y`) to position elements sequentially from top to bottom.
   * Calculates dynamic heights for cards based on the number of active filters.
   */
  public addCoverPage(options: PDFExportOptions) {
    this.district = options.district;
    this.dateStr = options.dateStr;

    // Cover header accent
    this.doc.setFillColor(30, 58, 138);
    this.doc.rect(0, 0, this.pageWidth, 40, "F");

    // Cover title
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(28);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text("Government Road", 10, 25);

    // G-TRISP logo placeholder
    this.doc.setFillColor(255, 255, 255);
    this.doc.roundedRect(this.pageWidth - 80, 8, 65, 24, 4, 4, "F");
    this.doc.setFontSize(14);
    this.doc.setTextColor(30, 58, 138);
    this.doc.text("G-TRISP", this.pageWidth - 47, 23, { align: "center" });

    let y = 60;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(34);
    this.doc.setTextColor(30, 58, 138);
    const mainTitle = "Accident Analysis Report";
    this.doc.text(mainTitle, this.pageWidth / 2, y, { align: "center" });
    y += 15;

    this.doc.setFontSize(18);
    this.doc.setTextColor(71, 85, 105);
    this.doc.text("Road Safety & Traffic Insights", this.pageWidth / 2, y, {
      align: "center",
    });

    y += 40;

    // District info card
    this.doc.setFillColor(248, 250, 252);
    this.doc.roundedRect(
      this.margin,
      y,
      this.pageWidth - 2 * this.margin,
      40,
      5,
      5,
      "F"
    );
    this.doc.setDrawColor(226, 232, 240);
    this.doc.roundedRect(
      this.margin,
      y,
      this.pageWidth - 2 * this.margin,
      40,
      5,
      5,
      "S"
    );

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.setTextColor(30, 58, 138);
    this.doc.text("District", this.margin + 10, y + 15);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(16);
    this.doc.setTextColor(30, 41, 59);
    this.doc.text(options.district, this.margin + 10, y + 28);

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.setTextColor(30, 58, 138);
    this.doc.text("Generated On", this.pageWidth / 2, y + 15, {
      align: "center",
    });
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(14);
    this.doc.setTextColor(30, 41, 59);
    this.doc.text(options.dateStr, this.pageWidth / 2, y + 28, {
      align: "center",
    });

    y += 50;

    // Applied filters card
    // Dynamically calculate height based on number of filters to ensure they all fit within the card bounds.
    if (options.filters.length > 0) {
      this.doc.setFillColor(248, 250, 252);
      const filterHeight = 30 + options.filters.length * 6;
      this.doc.roundedRect(
        this.margin,
        y,
        this.pageWidth - 2 * this.margin,
        filterHeight,
        5,
        5,
        "F"
      );
      this.doc.setDrawColor(226, 232, 240);
      this.doc.roundedRect(
        this.margin,
        y,
        this.pageWidth - 2 * this.margin,
        filterHeight,
        5,
        5,
        "S"
      );

      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(12);
      this.doc.setTextColor(30, 58, 138);
      this.doc.text("Applied Filters", this.margin + 10, y + 15);

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(10);
      this.doc.setTextColor(51, 65, 85);
      options.filters.forEach((f, i) => {
        this.doc.text(`• ${f}`, this.margin + 15, y + 25 + i * 6);
      });
    }

    // Cover footer
    this.doc.setFillColor(30, 58, 138);
    this.doc.rect(0, this.pageHeight - 15, this.pageWidth, 15, "F");
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text(
      "Gujarat Road Accident Analysis System",
      this.pageWidth / 2,
      this.pageHeight - 6,
      { align: "center" }
    );
  }

  /**
   * Adds a new page with a professional header and footer.
   * Resets the vertical cursor (`currentY`) for subsequent content insertion.
   * 
   * @param sectionTitle - Title of the section for this page (displayed in header)
   * 
   * Side Effects: Adds a new page to the jsPDF document and updates internal cursor state.
   */
  public addNewPage(sectionTitle: string) {
    this.doc.addPage();
    this.sectionTitle = sectionTitle;
    this.currentY = 25;

    this.addHeaderInternal();
    this.addFooterInternal();
  }

  /**
   * Adds a section header with an optional description below it.
   * Handles text wrapping for long descriptions to ensure they stay within page margins.
   * 
   * @param title - Section title to display prominently
   * @param description - Optional section description text providing context
   */
  public addSectionHeader(title: string, description?: string) {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(18);
    this.doc.setTextColor(30, 58, 138);
    this.doc.text(title, this.margin, this.currentY);

    this.currentY += 6;

    this.doc.setDrawColor(226, 232, 240);
    this.doc.line(
      this.margin,
      this.currentY,
      this.pageWidth - this.margin,
      this.currentY
    );

    this.currentY += 8;

    if (description) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(10);
      this.doc.setTextColor(100, 116, 139);
      const descLines = this.doc.splitTextToSize(
        description,
        this.pageWidth - 2 * this.margin
      );
      this.doc.text(descLines, this.margin, this.currentY);
      this.currentY += descLines.length * 5 + 5;
    }
  }

  /**
   * Captures an HTML element to an image without adding it to the PDF yet.
   * This allows for parallel rendering of multiple elements, improving export speed.
   * 
   * @param elementId - ID of the HTML element to capture in the DOM
   * @returns Promise with captured image data (base64) and calculated PDF dimensions, or null if element not found
   * 
   * Technical Detail:
   * Uses html2canvas to render the DOM node. The scale is kept at 1 for maximum performance
   * and to prevent out-of-memory errors on large charts or maps.
   * The returned dimensions are scaled to fit within the PDF's printable area width.
   */
  public async captureElement(
    elementId: string
  ): Promise<{ imgData: string; imgWidth: number; imgHeight: number } | null> {
    const el = document.getElementById(elementId);
    if (!el) {
      console.warn(`Element with ID ${elementId} not found.`);
      return null;
    }

    // Capture the element
    const canvas = await html2canvas(el, {
      scale: 1, // Reduced to 1 for maximum performance
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      ignoreElements: (element) => element.id === "root",
    });
    const imgData = canvas.toDataURL("image/png");

    const imgWidth = this.pageWidth - 2 * this.margin;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    return { imgData, imgWidth, imgHeight };
  }

  /**
   * Adds a pre-captured image to the PDF document.
   * Automatically calculates vertical space and adds page breaks if the image
   * (plus its optional title/description) exceeds the available space on the current page.
   * 
   * @param capture - Pre-captured image data containing base64 string and scaled dimensions
   * @param title - Optional title for the image section
   * @param description - Optional description for the image section
   * 
   * Layout Logic:
   * 1. Calculates total required vertical height (`neededHeight`).
   * 2. Triggers `addNewPage` if `neededHeight` surpasses the printable area.
   * 3. Draws title/description text and advances the vertical cursor.
   * 4. Embeds the image and advances the vertical cursor for the next element.
   */
  public addCapturedImage(
    capture: { imgData: string; imgWidth: number; imgHeight: number },
    title?: string,
    description?: string
  ) {
    const { imgData, imgWidth, imgHeight } = capture;

    const neededHeight = title
      ? description
        ? this.currentY + 8 + 5 + imgHeight + 10
        : this.currentY + 8 + imgHeight + 10
      : this.currentY + imgHeight + 10;
    if (neededHeight > this.pageHeight - this.margin - 20) {
      this.addNewPage(this.sectionTitle);
    }

    if (title) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(14);
      this.doc.setTextColor(51, 65, 85);
      this.doc.text(title, this.margin, this.currentY);
      this.currentY += 8;

      if (description) {
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(10);
        this.doc.setTextColor(100, 116, 139);
        const descLines = this.doc.splitTextToSize(
          description,
          this.pageWidth - 2 * this.margin
        );
        this.doc.text(descLines, this.margin, this.currentY);
        this.currentY += descLines.length * 5 + 5;
      }
    }

    this.doc.addImage(
      imgData,
      "PNG",
      this.margin,
      this.currentY,
      imgWidth,
      imgHeight
    );
    this.currentY += imgHeight + 10;
  }

  /**
   * Saves the generated PDF document to the user's local device.
   * Triggers the browser's native file download prompt.
   * 
   * @param filename - Name of the file to be saved (e.g., 'report.pdf')
   */
  public save(filename: string) {
    this.doc.save(filename);
  }
}
