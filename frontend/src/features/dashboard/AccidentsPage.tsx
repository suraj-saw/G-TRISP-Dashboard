// frontend/src/features/dashboard/AccidentsPage.tsx
/**
 * Dedicated Accident Management page.
 * Full-page enterprise layout with its own TopBar, session guard,
 * and separate actions for Add Record vs Import Records.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Database,
  Plus,
  Upload,
  ShieldAlert,
  Loader2,
  CheckCircle,
} from "lucide-react";

import API from "../../api/axios";
import TopBar from "../../components/layout/TopBar";
import { ROUTES } from "../../config/constants";
import AccidentManagement from "./AccidentManagement";
import AccidentFormModal from "../../components/admin/AccidentFormModal";
import ImportRecordsModal from "../../components/admin/ImportRecordsModal";

import type { User } from "../../types/user";
import type { Notification } from "../../types/notification";

const SESSION_POLL_INTERVAL_MS = 5000;
type SessionStatus = "checking" | "active" | "kicked";

export default function AccidentsPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const loaded = useRef(false);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Success toasts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Force table refresh key
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Session polling ──────────────────────────────────────────────────────

  const loadNotifications = useCallback(async () => {
    try {
      const res = await API.get<Notification[]>("/admin/notifications");
      setNotifications(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const userRes = await API.get<User>("/auth/me");
        if (!active) return;
        if (userRes.data.role !== "admin") {
          navigate(ROUTES.DASHBOARD, { replace: true });
          return;
        }
        setUser(userRes.data);
        await loadNotifications();
        loaded.current = true;
        setSessionStatus("active");
        timer = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          navigate(ROUTES.LOGIN, { replace: true });
        }
      }
    };

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [navigate, loadNotifications]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const logout = async () => {
    try { await API.post("/auth/logout"); } catch {}
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const handleAddSuccess = (accidentId: string) => {
    setAddModalOpen(false);
    setSuccessMsg(`Record ${accidentId} added successfully.`);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleImportSuccess = (count: number) => {
    setImportModalOpen(false);
    setSuccessMsg(`Successfully imported ${count} record(s).`);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // ── Guards ───────────────────────────────────────────────────────────────

  if (sessionStatus === "checking") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <p className="mt-4 text-slate-500 font-medium animate-pulse">Loading...</p>
      </div>
    );
  }
  if (sessionStatus === "kicked") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Session Expired</h2>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Success toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-[100] flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-3.5 shadow-xl shadow-emerald-900/10 text-emerald-800 text-sm font-semibold"
          >
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <TopBar
        appName="G-TRISP"
        user={user!}
        notificationCount={unreadCount}
        onLogout={logout}
      />

      <main className="flex-1 flex flex-col px-4 md:px-6 xl:px-8 2xl:px-12 pt-4 pb-6">
        {/* ── Page Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4"
        >
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate(ROUTES.ADMIN_PANEL)}
              className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-indigo-700 hover:border-indigo-200 hover:shadow-sm transition-all"
              title="Back to Admin Panel"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-100 rounded-xl">
                <Database className="w-5 h-5 text-indigo-700" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-800">
                  Accident Management
                </h1>
                <p className="text-xs text-slate-400 font-medium">
                  Browse, search, and manage accident database records
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-indigo-200 rounded-xl text-sm font-semibold shadow-sm transition-all"
            >
              <Upload className="w-4 h-4" />
              Import Records
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-700/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Accident
            </motion.button>
          </div>
        </motion.div>

        {/* ── Data Table (fills remaining space) ── */}
        <div className="flex-1 flex flex-col min-h-0" key={refreshKey}>
          <AccidentManagement />
        </div>
      </main>

      {/* ── Modals ── */}
      <AccidentFormModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleAddSuccess}
        initialData={null}
      />

      <ImportRecordsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}
