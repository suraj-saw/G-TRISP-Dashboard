/**
 * @file BlackspotRemarksTimelineModal.tsx
 * @description Interactive Modal & Timeline for Blackspot Cluster Remarks.
 *
 * Renders via React Portal at the document root to avoid any clipping from map
 * containers or popups. Displays the full chronological history of remarks
 * (who added what and when), allows adding new remarks to the timeline, and
 * supports editing/deleting existing remarks.
 */

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Send,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  MapPin,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import {
  fetchRemarksTimeline,
  createRemark,
  updateRemark,
  deleteRemark,
  type Remark,
  type RemarkCreatePayload,
} from "../../api/remarksApi";
import { getPriorityColor } from "../../config/blackspotConfig";

interface BlackspotRemarksTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Comma-separated crash IDs from the blackspot cluster */
  crashIds: string;
  /** Cluster identifier (e.g. 3) */
  clusterId?: number | string;
  /** Priority score */
  priorityScore?: number;
  /** Priority label (e.g. "High Priority") */
  priorityLabel?: string;
  /** Total crashes in this cluster */
  crashCount?: number;
  /** Location or landmark */
  landmark?: string | null;
  /** Visualization type (e.g. "blackspot", "dbscan_blackspot") */
  visualizationType?: string;
  /** District name */
  district?: string | null;
  /** Centroid latitude */
  centroidLat?: number;
  /** Centroid longitude */
  centroidLon?: number;
  /** Notification callback when a remark is created */
  onRemarkAdded?: (remark: Remark) => void;
  /** Notification callback when a remark is updated */
  onRemarkUpdated?: (remark: Remark) => void;
  /** Notification callback when a remark is deleted */
  onRemarkDeleted?: (remarkId: number, remainingCount: number, latestRemark: Remark | null) => void;
}

/**
 * Format timestamp into friendly date and time.
 */
function formatDateTime(isoString: string): { relative: string; full: string } {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = "";
    if (diffSec < 45) {
      relative = "Just now";
    } else if (diffMin < 60) {
      relative = `${diffMin}m ago`;
    } else if (diffHours < 24) {
      relative = `${diffHours}h ago`;
    } else if (diffDays === 1) {
      relative = "Yesterday";
    } else if (diffDays < 7) {
      relative = `${diffDays}d ago`;
    } else {
      relative = date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }

    const full = date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return { relative, full };
  } catch {
    return { relative: isoString, full: isoString };
  }
}

export default function BlackspotRemarksTimelineModal({
  isOpen,
  onClose,
  crashIds,
  clusterId,
  priorityScore = 0,
  priorityLabel,
  crashCount,
  landmark,
  visualizationType = "blackspot",
  district,
  centroidLat,
  centroidLon,
  onRemarkAdded,
  onRemarkUpdated,
  onRemarkDeleted,
}: BlackspotRemarksTimelineModalProps) {
  const [timeline, setTimeline] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New remark state
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load timeline whenever modal opens or crashIds change
  useEffect(() => {
    if (!isOpen || !crashIds) return;

    let active = true;
    setLoading(true);
    setError(null);
    setNewText("");
    setEditingId(null);
    setConfirmDeleteId(null);

    const ids = crashIds.split(",").map((id) => id.trim()).filter(Boolean);
    fetchRemarksTimeline(ids, centroidLat, centroidLon, 250)
      .then((items) => {
        if (active) {
          setTimeline(items);
        }
      })
      .catch((err) => {
        if (active) {
          setError("Failed to load remarks timeline.");
          console.error("Error fetching remarks timeline:", err);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, crashIds]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const priorityColor = getPriorityColor(priorityScore);

  // Submit new remark
  const handleCreateRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const ids = crashIds.split(",").map((id) => id.trim()).filter(Boolean);
      const payload: RemarkCreatePayload = {
        crash_ids: ids,
        visualization_type: visualizationType,
        district: district ?? undefined,
        centroid_lat: centroidLat ?? 0,
        centroid_lon: centroidLon ?? 0,
        remark: newText.trim(),
      };

      const created = await createRemark(payload);
      setTimeline((prev) => [created, ...prev]);
      setNewText("");
      onRemarkAdded?.(created);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to add remark.");
    } finally {
      setSubmitting(false);
    }
  };

  // Save edited remark
  const handleUpdateRemark = async (remarkId: number) => {
    if (!editText.trim() || savingEdit) return;

    setSavingEdit(true);
    setError(null);

    try {
      const updated = await updateRemark(remarkId, editText.trim());
      setTimeline((prev) =>
        prev.map((item) => (item.id === remarkId ? updated : item))
      );
      setEditingId(null);
      setEditText("");
      onRemarkUpdated?.(updated);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to update remark.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete remark
  const handleDeleteRemark = async (remarkId: number) => {
    if (confirmDeleteId !== remarkId) {
      setConfirmDeleteId(remarkId);
      return;
    }

    setDeletingId(remarkId);
    setError(null);

    try {
      await deleteRemark(remarkId);
      const remaining = timeline.filter((item) => item.id !== remarkId);
      setTimeline(remaining);
      setConfirmDeleteId(null);
      const latest = remaining.length > 0 ? remaining[0] : null;
      onRemarkDeleted?.(remarkId, remaining.length, latest);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to delete remark.");
    } finally {
      setDeletingId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden font-sans text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header Banner ────────────────────────────────────────── */}
        <div
          className="px-5 py-3.5 text-white flex items-center justify-between shadow-sm shrink-0"
          style={{ backgroundColor: priorityColor }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-xs shrink-0">
              <MessageSquare size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                  {clusterId !== undefined
                    ? `Cluster #${clusterId} Remarks Timeline`
                    : "Blackspot Remarks Timeline"}
                </h2>
                {priorityLabel && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-white/25 rounded-full tracking-wider shrink-0">
                    {priorityLabel}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/85 truncate flex items-center gap-1.5 mt-0.5">
                {crashCount !== undefined && (
                  <span>{crashCount} crashes</span>
                )}
                {landmark && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5 truncate">
                      <MapPin size={10} className="inline shrink-0" /> {landmark}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 ml-2"
            title="Close Timeline"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Error Notification ─────────────────────────────────────────── */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700 shrink-0">
            <AlertCircle size={14} className="shrink-0 text-red-500" />
            <span className="truncate">{error}</span>
          </div>
        )}

        {/* ── Composer Form (Add New Remark) ──────────────────────────────── */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <form onSubmit={handleCreateRemark} className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 tracking-wide uppercase">
              Add New Remark / Observation
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Log observation, remediation action, site inspection finding, or engineering note..."
                maxLength={2000}
                rows={2}
                className="w-full text-xs sm:text-sm text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all resize-none placeholder:text-slate-400"
              />
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] text-slate-400 font-medium">
                {newText.length}/2000 characters
              </span>
              <button
                type="submit"
                disabled={submitting || !newText.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                <span>Post Remark</span>
              </button>
            </div>
          </form>
        </div>

        {/* ── Timeline Scroll Container ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={13} className="text-slate-400" />
              <span>Remarks History</span>
              <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-extrabold">
                {timeline.length}
              </span>
            </span>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
              <p className="text-xs font-medium">Loading remarks timeline...</p>
            </div>
          ) : timeline.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
              <MessageSquare size={28} className="mx-auto text-slate-300 mb-2" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-700">No remarks yet</h3>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">
                Be the first to record an observation, audit remark, or remediation status for this blackspot.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-100">
              {timeline.map((item) => {
                const { relative, full } = formatDateTime(item.created_at);
                const isEditing = editingId === item.id;
                const isConfirmingDelete = confirmDeleteId === item.id;
                const isDeleting = deletingId === item.id;

                return (
                  <div key={item.id} className="relative group">
                    {/* Node Dot */}
                    <div className="absolute -left-[29px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 shadow-xs flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    </div>

                    {/* Node Content Card */}
                    <div className="rounded-xl bg-white border border-slate-200/90 shadow-xs p-3.5 transition-all hover:border-slate-300">
                      {/* Header: Author & Timestamp */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white font-bold text-[10px] flex items-center justify-center uppercase shrink-0">
                            {item.created_by_username?.[0] || "U"}
                          </div>
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {item.created_by_username}
                          </span>
                          <span
                            className="text-[10px] text-slate-400 cursor-help shrink-0"
                            title={full}
                          >
                            • {relative}
                          </span>
                          {item.match_type === "spatial" ? (
                            <span
                              className="text-[8.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 rounded px-1 py-0.2 shrink-0 flex items-center gap-0.5"
                              title={`Remark recorded for this physical site under different filter parameters (~${item.distance_m != null ? Math.round(item.distance_m) : 0}m from center)`}
                            >
                              <MapPin size={8} />
                              Site match • {item.distance_m != null ? `${Math.round(item.distance_m)}m` : "Nearby"}
                            </span>
                          ) : (
                            <span
                              className="text-[8.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded px-1 py-0.2 shrink-0"
                              title="Remark recorded for this exact cluster"
                            >
                              Exact cluster
                            </span>
                          )}
                          {item.updated_at && (
                            <span className="text-[9px] text-slate-400 italic shrink-0">
                              (edited)
                            </span>
                          )}
                        </div>

                        {/* Action buttons (Edit & Delete) */}
                        {!isEditing && (
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingId(item.id);
                                setEditText(item.remark);
                                setConfirmDeleteId(null);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Edit remark"
                              type="button"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteRemark(item.id)}
                              disabled={isDeleting}
                              className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                                isConfirmingDelete
                                  ? "bg-red-500 text-white hover:bg-red-600 font-bold"
                                  : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                              }`}
                              title={
                                isConfirmingDelete
                                  ? "Click again to confirm deletion"
                                  : "Delete remark"
                              }
                              type="button"
                            >
                              {isDeleting ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                              {isConfirmingDelete && <span>Confirm</span>}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Remark Text / Inline Editor */}
                      <div className="pt-2">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={2}
                              maxLength={2000}
                              className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setEditText("");
                                }}
                                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 rounded transition-colors cursor-pointer"
                                type="button"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleUpdateRemark(item.id)}
                                disabled={savingEdit || !editText.trim()}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded transition-colors cursor-pointer"
                                type="button"
                              >
                                {savingEdit && <Loader2 size={11} className="animate-spin" />}
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {item.remark}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Modal Footer ───────────────────────────────────────────────── */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>Remarks are tied to this exact accident cluster.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
