import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface PDFExportOptions {
  title: string;
  district: string;
  dateStr: string;
  filters: string[];
}

export class PdfEngine {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 20;
  private currentY: number = 30;
  private sectionTitle: string = "";
  private district: string = "";
  private dateStr: string = "";

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
   * Adds professional header with branding, section title, and page number
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
   * Adds professional footer with generation date and page number
   */
  private addFooterInternal() {
    const pageCount = this.doc.getNumberOfPages();
    const totalPages = this.doc.getNumberOfPages();
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
   */
  public addNewPage(sectionTitle: string) {
    this.doc.addPage();
    this.sectionTitle = sectionTitle;
    this.currentY = 25;

    this.addHeaderInternal();
    this.addFooterInternal();
  }

  /**
   * Adds section header with description
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
   * Captures an HTML element and adds it to the PDF.
   * Auto-scales and adds page breaks if necessary.
   */
  public async addElementAsImage(
    elementId: string,
    title?: string,
    description?: string
  ) {
    const el = document.getElementById(elementId);
    if (!el) {
      console.warn(`Element with ID ${elementId} not found.`);
      return;
    }

    // Capture the element
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/png");

    const imgWidth = this.pageWidth - 2 * this.margin;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

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

  public save(filename: string) {
    this.doc.save(filename);
  }
}
