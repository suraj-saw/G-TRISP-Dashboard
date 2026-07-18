/**
 * @file ImportRecordsModal.tsx
 * @description Provides a modal interface for administrators to upload and import accident records from CSV/Excel files.
 * @responsibility Handles file selection, validation (via API), previewing valid/invalid rows, and committing the final import.
 * @dependencies framer-motion (animations), lucide-react (icons), adminAccidentsApi (API integration).
 */

import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  adminAccidentsApi,
  type ValidationIssueRow,
} from "../../api/adminAccidentsApi";

/**
 * Props for the ImportRecordsModal component.
 * @property {boolean} open - Determines if the modal is visible.
 * @property {function} onClose - Callback invoked to close the modal.
 * @property {function} onSuccess - Callback invoked when records are successfully imported, returning the count.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

/** Represents the current stage of the import workflow. */
type Step = "select" | "preview" | "importing" | "done";

/**
 * Detailed error response structure from the import API.
 * Contains information about missing columns or row-level validation issues.
 */
interface ErrorDetail {
  error: string;
  message: string;
  missing?: string[];
  expected?: string[];
  row_errors?: ValidationIssueRow[];
  total_error_rows?: number;
  duplicates?: string[];
}

/**
 * Renders a list of validation issues (e.g., invalid rows, duplicates) with their corresponding row numbers and error messages.
 * @param {Object} props - Component properties.
 * @param {string} props.title - The heading for this issue list.
 * @param {ValidationIssueRow[]} props.rows - Array of rows that failed validation.
 * @param {"rose" | "amber"} props.tone - Color theme for the issue list depending on severity.
 * @returns {JSX.Element | null} The rendered issue list or null if no rows exist.
 */
function IssueList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: ValidationIssueRow[];
  tone: "rose" | "amber";
}) {
  if (rows.length === 0) return null;

  const styles =
    tone === "rose"
      ? "bg-rose-50 border-rose-200 text-rose-800"
      : "bg-amber-50 border-amber-200 text-amber-800";

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <p className="text-xs font-bold uppercase tracking-wide mb-2">{title}</p>
      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
        {rows.map((row) => (
          <div key={`${title}-${row.row}`} className="rounded-lg bg-white/60 px-3 py-2 text-[11px]">
            <span className="font-bold">Row {row.row}</span>
            {row.accident_id ? <span className="font-mono"> - {row.accident_id}</span> : null}
            <div className="mt-1">{row.errors.join("; ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ImportRecordsModal Component
 * @responsibility Orchestrates the multi-step process of importing accident records from a file.
 * @state_management Uses local state for tracking workflow steps, file selection, validation metrics, data previews, and loading states.
 * @data_flow File is selected -> Sent to API for validation -> API returns valid/invalid row subsets -> Valid rows are confirmed by user -> Valid rows sent to API for final import.
 * @hooks_usage Uses useState for state and useCallback for resetting state efficiently.
 * @rendering_flow Conditionally renders the body based on the current 'step' ("select", "preview", "importing", "done").
 */
export default function ImportRecordsModal({ open, onClose, onSuccess }: Props) {
  // --- Workflow & UI State ---
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  
  // --- Validation Metrics & Data State ---
  const [totalRows, setTotalRows] = useState(0);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [preview, setPreview] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [validRows, setValidRows] = useState<Record<string, any>[]>([]);
  const [invalidRows, setInvalidRows] = useState<ValidationIssueRow[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<ValidationIssueRow[]>([]);
  const [importedCount, setImportedCount] = useState(0);

  /**
   * Resets all component states to their initial values.
   * @side_effects Clears selected file, resets workflow step, wipes validation data, and clears errors.
   */
  const reset = useCallback(() => {
    setStep("select");
    setFile(null);
    setUploading(false);
    setImporting(false);
    setError(null);
    setErrorDetail(null);
    setTotalRows(0);
    setValidCount(0);
    setInvalidCount(0);
    setDuplicateCount(0);
    setPreview([]);
    setColumns([]);
    setValidRows([]);
    setInvalidRows([]);
    setDuplicateRows([]);
    setImportedCount(0);
  }, []);

  /**
   * Handles modal closure, ensuring all internal state is reset so the next open starts fresh.
   */
  const handleClose = () => {
    reset();
    onClose();
  };

  /**
   * Updates the selected file from the input and clears any previous validation errors.
   * @param {ChangeEvent<HTMLInputElement>} event - The file input change event.
   */
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setError(null);
    setErrorDetail(null);
  };

  /**
   * Uploads the selected file to the server for validation without committing to the database.
   * @business_rule Only parses and validates data, identifying duplicates and invalid formats.
   * @side_effects Updates component state with validation statistics, row previews, and transitions to the "preview" step.
   */
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setErrorDetail(null);

    try {
      const res = await adminAccidentsApi.uploadFile(file);
      setTotalRows(res.total_rows);
      setValidCount(res.valid_count);
      setInvalidCount(res.invalid_count);
      setDuplicateCount(res.duplicate_count);
      setPreview(res.preview);
      setColumns(res.columns);
      setValidRows(res.data); // These are the rows that passed validation
      setInvalidRows(res.invalid_rows || []);
      setDuplicateRows(res.duplicate_rows || []);
      setStep("preview");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      // Extract detailed validation issues if available
      if (typeof detail === "object" && detail !== null) {
        setErrorDetail(detail as ErrorDetail);
        setError(detail.message || "File validation failed.");
      } else {
        setError(typeof detail === "string" ? detail : "Failed to upload file.");
      }
    } finally {
      setUploading(false);
    }
  };

  /**
   * Sends the validated rows to the backend for final insertion into the database.
   * @side_effects Transitions state to "importing", then "done" upon success, and sets the number of inserted records.
   */
  const handleImport = async () => {
    setImporting(true);
    setStep("importing");
    setError(null);
    try {
      const res = await adminAccidentsApi.importRecords(validRows);
      setImportedCount(res.inserted);
      setStep("done");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === "object" && detail !== null) {
        setError(detail.message || "Import failed.");
      } else {
        setError(typeof detail === "string" ? detail : "Import failed.");
      }
      setStep("preview"); // Fall back to preview if import fails
    } finally {
      setImporting(false);
    }
  };

  /**
   * Concludes the import workflow and invokes the success callback to trigger table refreshes.
   */
  const handleDone = () => {
    onSuccess(importedCount);
    handleClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl shadow-slate-900/25 border border-slate-200 flex flex-col overflow-hidden pointer-events-auto"
              style={{ maxHeight: "90vh" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative flex items-center gap-3 px-6 pt-6 pb-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 shrink-0">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Upload size={20} className="text-emerald-200" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Import Records</h2>
                  <p className="text-xs text-emerald-300 mt-0.5">
                    Upload, validate, review, then import valid accident rows
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="absolute right-4 top-4 p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {step === "select" && (
                  <div className="flex flex-col gap-5">
                    <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-indigo-400 transition-all cursor-pointer">
                      <FileSpreadsheet className="w-12 h-12 text-slate-300" />
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700">
                          {file ? file.name : "Click to select a file"}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Supported formats: .xlsx, .csv
                        </p>
                      </div>
                      {file && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      )}
                      <input
                        type="file"
                        accept=".xlsx,.csv"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>

                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                      <p className="font-semibold mb-1.5">File requirements</p>
                      <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                        <li>First row must contain column headers.</li>
                        <li>Column names must match the database field names.</li>
                        <li>Rows with invalid values or duplicate accident IDs will be skipped.</li>
                        <li>Only valid rows are sent for final import after confirmation.</li>
                      </ul>
                    </div>

                    {error && (
                      <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
                        <div className="flex items-start gap-2.5">
                          <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-rose-800">{error}</p>
                            {errorDetail?.error === "missing_columns" && errorDetail.missing && (
                              <div className="mt-2">
                                <p className="text-xs text-rose-600 font-medium mb-1">
                                  Missing columns:
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {errorDetail.missing.map((column) => (
                                    <span
                                      key={column}
                                      className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[11px] font-mono rounded"
                                    >
                                      {column}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {step === "preview" && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        ["Total rows", totalRows, "text-slate-700", "bg-slate-50"],
                        ["Valid", validCount, "text-emerald-700", "bg-emerald-50"],
                        ["Invalid", invalidCount, "text-rose-700", "bg-rose-50"],
                        ["Duplicates", duplicateCount, "text-amber-700", "bg-amber-50"],
                      ].map(([label, value, text, bg]) => (
                        <div key={String(label)} className={`rounded-xl border border-slate-200 p-3 ${bg}`}>
                          <p className={`text-2xl font-black ${text}`}>{value}</p>
                          <p className="text-xs font-semibold text-slate-500">{label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                      {validCount > 0 ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {validCount > 0
                            ? `${validCount} valid row(s) ready for import`
                            : "No valid rows available to import"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Invalid and duplicate rows are not included in the final import.
                        </p>
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-rose-700">{error}</p>
                      </div>
                    )}

                    <IssueList title="Invalid rows" rows={invalidRows} tone="rose" />
                    <IssueList title="Duplicate rows" rows={duplicateRows} tone="amber" />

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Valid row preview
                        </p>
                        <p className="text-xs text-slate-400">
                          Showing {preview.length} of {validCount}
                        </p>
                      </div>
                      <div className="overflow-auto rounded-xl border border-slate-200 max-h-64">
                        <table className="w-full text-[11px] text-left whitespace-nowrap">
                          <thead className="bg-slate-100 text-slate-500 font-semibold uppercase tracking-wider sticky top-0">
                            <tr>
                              <th className="py-2 px-3 border-b border-slate-200">#</th>
                              {columns.map((column) => (
                                <th key={column} className="py-2 px-3 border-b border-slate-200">
                                  {column}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {preview.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={columns.length + 1}
                                  className="py-8 text-center text-slate-400"
                                >
                                  No valid rows to preview.
                                </td>
                              </tr>
                            ) : (
                              preview.map((row, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                  <td className="py-1.5 px-3 text-slate-400 font-medium">
                                    {index + 1}
                                  </td>
                                  {columns.map((column) => (
                                    <td
                                      key={column}
                                      className="py-1.5 px-3 text-slate-600 max-w-[150px] truncate"
                                    >
                                      {row[column] != null ? String(row[column]) : "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {step === "importing" && (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                    <p className="text-sm font-semibold text-slate-700">
                      Importing {validCount} records...
                    </p>
                    <p className="text-xs text-slate-400">This may take a moment for large files.</p>
                  </div>
                )}

                {step === "done" && (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="p-4 bg-emerald-50 rounded-full">
                      <CheckCircle className="w-12 h-12 text-emerald-500" />
                    </div>
                    <p className="text-lg font-bold text-slate-800">Import Complete</p>
                    <p className="text-sm text-slate-500">
                      Successfully imported{" "}
                      <span className="font-bold text-emerald-600">{importedCount}</span>{" "}
                      record(s) into the database.
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                {step === "select" && (
                  <>
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={!file || uploading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Validating...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Upload & Validate
                        </>
                      )}
                    </button>
                  </>
                )}
                {step === "preview" && (
                  <>
                    <button
                      onClick={() => {
                        setStep("select");
                        setError(null);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importing || validCount === 0}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Confirm Import ({validCount} valid)
                    </button>
                  </>
                )}
                {step === "done" && (
                  <div className="flex w-full justify-end">
                    <button
                      onClick={handleDone}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                    >
                      Done
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
