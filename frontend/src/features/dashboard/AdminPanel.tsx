// frontend/src/features/dashboard/AdminPanel.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import {
  ArrowLeft,
  Shield,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Bell,
  Clock,
  Check,
  X,
  ShieldAlert,
  UserCog,
  UserCheck,
  UserX,
  Hourglass,
  Loader2,
} from "lucide-react";

import API from "../../api/axios";
import TopBar from "../../components/layout/TopBar";
import { ROUTES } from "../../config/constants";

import type { User } from "../../types/user";
import type { Notification } from "../../types/notification";

const SESSION_POLL_INTERVAL_MS = 5000;

type SessionStatus = "checking" | "active" | "kicked";
type ActiveTab = "pending" | "all";

// Stagger variants for smooth loading
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

function StatusBadge({ status }: { status: User["status"] }) {
  const styles: Record<User["status"], string> = {
    approved: "bg-emerald-100/80 text-emerald-700 border-emerald-200/50",
    rejected: "bg-rose-100/80 text-rose-700 border-rose-200/50",
    pending: "bg-amber-100/80 text-amber-700 border-amber-200/50",
  };

  const icons: Record<User["status"], ReactNode> = {
    approved: <CheckCircle className="w-3 h-3 mr-1" />,
    rejected: <XCircle className="w-3 h-3 mr-1" />,
    pending: <Clock className="w-3 h-3 mr-1" />,
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize border ${styles[status]}`}
    >
      {icons[status]}
      {status}
    </span>
  );
}

function AdminPanel() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [, setAdminData] = useState<any>(null);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [activeTab, setActiveTab] = useState<ActiveTab>("pending");

  const loaded = useRef(false);
  // Tracks whether we have already fired the mark-all-read call for this
  // AdminPanel session. We only want it to run once on first mount, not on
  // every subsequent 5-second poll tick.
  const markedAllRead = useRef(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);

  const [confirmTitle, setConfirmTitle] = useState("");

  const [confirmMessage, setConfirmMessage] = useState("");

  const [confirmButtonText, setConfirmButtonText] = useState("Confirm");

  const [confirmDanger, setConfirmDanger] = useState(false);

  // ── data loaders ────────────────────────────────────────────────────────────

  const loadPendingUsers = useCallback(async () => {
    try {
      const res = await API.get<User[]>("/admin/users/pending");
      setPendingUsers(res.data);
    } catch {
      /* 401 handled by polling loop */
    }
  }, []);

  const loadAllUsers = useCallback(async () => {
    try {
      const res = await API.get<User[]>("/admin/users");
      // exclude admins from the management table
      setAllUsers(res.data.filter((u) => u.role !== "admin"));
    } catch {
      /* ignore */
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await API.get<Notification[]>("/admin/notifications");
      setNotifications(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  // ── session polling ──────────────────────────────────────────────────────────

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

        if (!loaded.current) {
          const adminRes = await API.get("/admin/dashboard");
          setAdminData(adminRes.data);
        }

        await Promise.all([
          loadPendingUsers(),
          loadAllUsers(),
          loadNotifications(),
        ]);

        // ── Mark all notifications as read on first panel visit ───────────
        // Only fire once per AdminPanel mount so the 5-second polling loop
        // doesn't keep re-marking on every tick.
        if (!markedAllRead.current) {
          markedAllRead.current = true;
          try {
            await API.post("/admin/notifications/read-all");
            // Reload so the UI immediately shows zero unread / no 'NEW' tags.
            await loadNotifications();
          } catch {
            /* non-critical – the badge will self-correct on the next poll */
          }
        }

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
  }, [navigate, loadPendingUsers, loadAllUsers, loadNotifications]);

  // ── action handlers ──────────────────────────────────────────────────────────

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch {}
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const openConfirmation = ({
    title,
    message,
    buttonText,
    danger = false,
    action,
  }: {
    title: string;
    message: string;
    buttonText: string;
    danger?: boolean;
    action: () => Promise<void>;
  }) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmButtonText(buttonText);
    setConfirmDanger(danger);
    setPendingAction(() => action);
    setConfirmDialogOpen(true);
  };

  const handleDecision = async (
    userId: number,
    decision: "approve" | "reject"
  ) => {
    setActionLoadingId(userId);
    setActionError(null);
    try {
      await API.post(`/admin/users/${userId}/${decision}`);
      await Promise.all([
        loadPendingUsers(),
        loadAllUsers(),
        loadNotifications(),
      ]);
    } catch (err: any) {
      setActionError(
        err?.response?.data?.detail || "Could not update the user. Try again."
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStatusChange = async (
    userId: number,
    newStatus: "approved" | "rejected"
  ) => {
    setActionLoadingId(userId);
    setActionError(null);
    try {
      await API.post(`/admin/users/${userId}/set-status`, {
        status: newStatus,
      });
      await Promise.all([loadAllUsers(), loadNotifications()]);
    } catch (err: any) {
      setActionError(
        err?.response?.data?.detail || "Could not update the user. Try again."
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── guards ───────────────────────────────────────────────────────────────────

  if (sessionStatus === "checking") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Loader2 className="w-10 h-10 text-blue-600 mb-4" />
        </motion.div>
        <p className="text-slate-500 font-medium animate-pulse">
          Checking secure session...
        </p>
      </div>
    );
  }
  if (sessionStatus === "kicked") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Session Expired</h2>
        <p className="text-slate-500 mt-2">Please log in again to continue.</p>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const decidedUsers = allUsers.filter((u) => u.status !== "pending");
  const approvedCount = allUsers.filter((u) => u.status === "approved").length;
  const rejectedCount = allUsers.filter((u) => u.status === "rejected").length;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 relative overflow-hidden font-sans">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-5%] w-96 h-96 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse pointer-events-none" />
      <div
        className="absolute top-[20%] right-[-5%] w-96 h-96 bg-indigo-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute bottom-[-10%] left-[20%] w-96 h-96 bg-purple-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse pointer-events-none"
        style={{ animationDelay: "4s" }}
      />

      <TopBar
        appName="G-TRISP"
        user={user!}
        notificationCount={unreadCount}
        onLogout={logout}
      />

      <main className="relative z-10 px-6 md:px-8 xl:px-10 2xl:px-14 pt-6 pb-10 flex flex-col min-h-[calc(100vh-64px)]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-row justify-between items-center mb-8 gap-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-100 rounded-xl shrink-0">
              <Shield className="w-6 h-6 text-indigo-700" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-900 via-indigo-800 to-purple-900 truncate">
                Admin Control Panel
              </h1>
              <p className="text-slate-400 text-xs font-medium mt-0.5">
                Manage users &amp; access control
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(ROUTES.ADMIN)}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-slate-200/60 shadow-sm hover:shadow-md hover:bg-white text-indigo-700 rounded-xl text-sm font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </motion.button>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1"
        >
          {/* Main Content Column — 8/12 ≈ 67% */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {/* Welcome Banner */}
            <motion.div
              variants={itemVariants}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 text-white shadow-xl shadow-indigo-900/20 border border-white/10 p-5 sm:p-6"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full filter blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10 flex flex-row items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-1">
                    Signed in as
                  </p>
                  <h2 className="text-xl font-bold truncate">
                    {user?.username}
                  </h2>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10 text-xs font-semibold text-indigo-100">
                    <Shield className="w-3 h-3 text-indigo-300" />
                    {user?.role.toUpperCase()}
                  </div>
                </div>
                <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 shrink-0">
                  <UserCog className="w-9 h-9 text-indigo-200 opacity-90" />
                </div>
              </div>
            </motion.div>

            {/* ── Summary Stats Cards ── */}
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-2 xl:grid-cols-4 gap-3"
            >
              {[
                {
                  label: "Total Users",
                  value: allUsers.length,
                  icon: <Users className="w-5 h-5" />,
                  color: "text-indigo-600",
                  bg: "bg-indigo-50",
                  border: "border-indigo-100",
                  sub: "Non-admin accounts",
                },
                {
                  label: "Pending",
                  value: pendingUsers.length,
                  icon: <Hourglass className="w-5 h-5" />,
                  color: "text-amber-600",
                  bg: "bg-amber-50",
                  border: "border-amber-100",
                  sub: "Awaiting review",
                },
                {
                  label: "Approved",
                  value: approvedCount,
                  icon: <UserCheck className="w-5 h-5" />,
                  color: "text-emerald-600",
                  bg: "bg-emerald-50",
                  border: "border-emerald-100",
                  sub: "Active accounts",
                },
                {
                  label: "Rejected",
                  value: rejectedCount,
                  icon: <UserX className="w-5 h-5" />,
                  color: "text-rose-600",
                  bg: "bg-rose-50",
                  border: "border-rose-100",
                  sub: "Revoked accounts",
                },
              ].map((stat) => (
                <motion.div
                  key={stat.label}
                  whileHover={{
                    y: -3,
                    boxShadow: "0 10px 32px rgba(0,0,0,0.10)",
                    borderColor: "rgba(99,102,241,0.25)",
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className={`bg-white border ${stat.border} rounded-2xl p-4 flex items-center gap-3 shadow-sm cursor-default`}
                >
                  <div
                    className={`p-2.5 ${stat.bg} ${stat.color} rounded-xl shrink-0`}
                  >
                    {stat.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-3xl font-black text-slate-800 leading-none tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs font-semibold text-slate-600 mt-1">
                      {stat.label}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {stat.sub}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Error Banner */}
            <AnimatePresence>
              {actionError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl bg-rose-50 border border-rose-200/60 p-4 flex items-start gap-3 shadow-sm overflow-hidden"
                >
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-rose-800">
                    {actionError}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tabs & Table Container */}
            <motion.div
              variants={itemVariants}
              className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col flex-1 min-h-[560px]"
            >
              {/* Custom Segmented Control Tab Bar */}
              <div className="p-2 bg-slate-100/70 border-b border-slate-200/60 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTab("pending")}
                  className={`flex-1 min-w-[140px] relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    activeTab === "pending"
                      ? "bg-indigo-700 text-white shadow-md shadow-indigo-700/25"
                      : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  Pending Approvals
                  {pendingUsers.length > 0 && (
                    <span
                      className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold shrink-0 ${
                        activeTab === "pending"
                          ? "bg-white/20 text-white"
                          : "bg-amber-500 text-white shadow-sm"
                      }`}
                    >
                      {pendingUsers.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("all")}
                  className={`flex-1 min-w-[140px] relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    activeTab === "all"
                      ? "bg-indigo-700 text-white shadow-md shadow-indigo-700/25"
                      : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  User Management
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      activeTab === "all"
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {allUsers.length}
                  </span>
                </button>
              </div>

              <div className="p-5 flex flex-col flex-1">
                {/* ══ TAB: PENDING ══════════════════════════════════════════════════ */}
                <AnimatePresence mode="wait">
                  {activeTab === "pending" && (
                    <motion.div
                      key="pending"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="mb-6 flex justify-between items-end">
                        <div>
                          <h3 className="font-bold text-xl text-slate-800">
                            Action Required
                          </h3>
                          <p className="text-sm text-slate-500 mt-1">
                            Review and approve new user registrations.
                          </p>
                        </div>
                      </div>

                      {pendingUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6">
                          <div className="w-12 h-12 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mb-3 shadow-inner">
                            <CheckCircle className="w-6 h-6 text-emerald-500" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-700 mb-1">
                            No Pending Approvals
                          </h4>
                          <p className="text-xs text-slate-400 text-center max-w-xs">
                            All registrations reviewed. New requests will appear
                            here.
                          </p>
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
                            <Clock className="w-3 h-3" />
                            Last checked:{" "}
                            {new Date().toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200/60 shadow-sm">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                              <tr className="border-b border-slate-200/60">
                                <th className="py-4 px-6">User Details</th>
                                <th className="py-4 px-6 hidden md:table-cell">
                                  Registered
                                </th>
                                <th className="py-4 px-6 text-right">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {pendingUsers.map((pu) => (
                                <tr
                                  key={pu.id}
                                  className="hover:bg-slate-50/80 transition-colors group"
                                >
                                  <td className="py-4 px-6">
                                    <div className="font-semibold text-slate-800 text-base">
                                      {pu.username}
                                    </div>
                                    <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      {pu.email}
                                    </div>
                                  </td>
                                  <td className="py-4 px-6 hidden md:table-cell text-slate-500">
                                    {pu.created_at
                                      ? new Date(
                                          pu.created_at
                                        ).toLocaleDateString(undefined, {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                        })
                                      : "—"}
                                  </td>
                                  <td className="py-4 px-6">
                                    <div className="flex justify-end gap-3">
                                      <button
                                        disabled={actionLoadingId === pu.id}
                                        onClick={() =>
                                          openConfirmation({
                                            title: "Reject Registration",
                                            message: `Reject registration for ${user!.username}?`,
                                            buttonText: "Reject",
                                            danger: true,
                                            action: () =>
                                              handleDecision(
                                                user!.id,
                                                "reject"
                                              ),
                                          })
                                        }
                                        className="p-2 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                                        title="Reject"
                                      >
                                        <X className="w-5 h-5" />
                                      </button>
                                      <button
                                        disabled={actionLoadingId === pu.id}
                                        onClick={() =>
                                          openConfirmation({
                                            title: "Approve Registration",
                                            message: `Approve registration for ${user!.username}?`,
                                            buttonText: "Approve",
                                            action: () =>
                                              handleDecision(
                                                user!.id,
                                                "approve"
                                              ),
                                          })
                                        }
                                        className="p-2 rounded-xl text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-sm focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                                        title="Approve"
                                      >
                                        <Check className="w-5 h-5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ══ TAB: ALL USERS ════════════════════════════════════════════════ */}
                  {activeTab === "all" && (
                    <motion.div
                      key="all"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="mb-6 flex justify-between items-end">
                        <div>
                          <h3 className="font-bold text-xl text-slate-800">
                            Directory
                          </h3>
                          <p className="text-sm text-slate-500 mt-1">
                            Manage active and inactive accounts.
                          </p>
                        </div>
                      </div>

                      {decidedUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                          <Users className="w-16 h-16 mb-4 text-slate-200" />
                          <p className="font-medium text-slate-500">
                            No managed users yet.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200/60 shadow-sm">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                              <tr className="border-b border-slate-200/60">
                                <th className="py-4 px-6">User Details</th>
                                <th className="py-4 px-6 hidden sm:table-cell">
                                  Status
                                </th>
                                <th className="py-4 px-6 text-right">
                                  Toggle Access
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {decidedUsers.map((u) => (
                                <tr
                                  key={u.id}
                                  className="hover:bg-slate-50/80 transition-colors group"
                                >
                                  <td className="py-4 px-6">
                                    <div className="font-semibold text-slate-800 text-base">
                                      {u.username}
                                    </div>
                                    <div className="text-slate-500 text-xs mt-0.5">
                                      {u.email}
                                    </div>
                                  </td>
                                  <td className="py-4 px-6 hidden sm:table-cell">
                                    <StatusBadge status={u.status} />
                                  </td>
                                  <td className="py-4 px-6">
                                    <div className="flex justify-end">
                                      {u.status === "approved" ? (
                                        <button
                                          disabled={actionLoadingId === u.id}
                                          onClick={() =>
                                            openConfirmation({
                                              title: "Reject User",
                                              message: `Reject ${u.username}'s account?`,
                                              buttonText: "Reject",
                                              danger: true,
                                              action: () =>
                                                handleStatusChange(
                                                  u.id,
                                                  "rejected"
                                                ),
                                            })
                                          }
                                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 text-xs font-semibold disabled:opacity-50 transition-all border border-rose-200/50 cursor-pointer"
                                        >
                                          <XCircle className="w-3.5 h-3.5" />
                                          Revoke
                                        </button>
                                      ) : (
                                        <button
                                          disabled={actionLoadingId === u.id}
                                          onClick={() =>
                                            openConfirmation({
                                              title: "Approve User",
                                              message: `Approve ${u.username}'s account?`,
                                              buttonText: "Approve",
                                              action: () =>
                                                handleStatusChange(
                                                  u.id,
                                                  "approved"
                                                ),
                                            })
                                          }
                                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold disabled:opacity-50 transition-all border border-emerald-200/50 cursor-pointer"
                                        >
                                          <CheckCircle className="w-3.5 h-3.5" />
                                          Reinstate
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* Right Sidebar Column — 4/12 ≈ 33% */}
          <div className="lg:col-span-4 flex flex-col">
            {/* System Status Card */}
            {/* <motion.div
              variants={itemVariants}
              className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-6 shadow-xl shadow-slate-200/40 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                <Activity className="w-32 h-32 text-indigo-900" />
              </div>
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Activity className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-800">
                  System Status
                </h3>
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 rounded-2xl p-4 border border-slate-100 shadow-inner">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0" />
                  <p className="font-medium leading-relaxed">
                    {adminData?.message || "All systems operational"}
                  </p>
                </div>
              </div>
            </motion.div> */}

            {/* Activity Log — stretches to match left column height */}
            <motion.div
              variants={itemVariants}
              className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-5 shadow-xl shadow-slate-200/40 flex flex-col flex-1 min-h-[400px]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                    <Bell className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800">
                    Activity Log
                  </h3>
                </div>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
                    {unreadCount} New
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 py-8">
                    <Bell className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm">No recent activity.</p>
                  </div>
                ) : (
                  <ul className="space-y-1.5 pb-2">
                    {notifications.map((n, idx) => (
                      <motion.li
                        key={n.id}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className={`group flex items-start gap-2.5 p-2.5 rounded-xl border transition-all hover:shadow-sm cursor-default ${
                          n.is_read
                            ? "bg-white border-slate-100"
                            : "bg-indigo-50/60 border-indigo-100/70"
                        }`}
                      >
                        {/* Status dot */}
                        <span
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            n.is_read ? "bg-slate-300" : "bg-indigo-500"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs leading-snug ${
                              n.is_read
                                ? "text-slate-500"
                                : "text-indigo-900 font-semibold"
                            }`}
                          >
                            {n.message}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {(() => {
                              const now = new Date();
                              const today = new Date(
                                now.getFullYear(),
                                now.getMonth(),
                                now.getDate()
                              );
                              const yesterday = new Date(today);
                              yesterday.setDate(yesterday.getDate() - 1);
                              // Notifications don't have a real timestamp in the type, so show current time as placeholder
                              const t = now.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                              return `Today · ${t}`;
                            })()}
                          </p>
                        </div>
                        {!n.is_read && (
                          <span className="shrink-0 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-bold rounded-full">
                            NEW
                          </span>
                        )}
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </main>

      {/* Required style for custom scrollbar hiding/styling on webkit */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #e2e8f0;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #cbd5e1;
        }
      `,
        }}
      />
      <ConfirmDialog
        open={confirmDialogOpen}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmButtonText}
        cancelText="Cancel"
        danger={confirmDanger}
        onCancel={() => {
          setConfirmDialogOpen(false);
          setPendingAction(null);
        }}
        onConfirm={async () => {
          setConfirmDialogOpen(false);

          if (pendingAction) {
            await pendingAction();
          }

          setPendingAction(null);
        }}
      />
    </div>
  );
}

export default AdminPanel;
