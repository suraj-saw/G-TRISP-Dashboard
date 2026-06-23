// frontend/src/features/dashboard/AdminDashboard.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import API from "../../api/axios";
import TopBar from "../../components/layout/TopBar";

import type { User } from "../../types/user";
import type { Notification } from "../../types/notification";

const SESSION_POLL_INTERVAL_MS = 5000;

type SessionStatus = "checking" | "active" | "kicked";
type ActiveTab = "pending" | "all";

function StatusBadge({ status }: { status: User["status"] }) {
  const styles: Record<User["status"], string> = {
    approved: "bg-green-100 text-green-700 border border-green-200",
    rejected: "bg-red-100 text-red-600 border border-red-200",
    pending: "bg-amber-100 text-amber-700 border border-amber-200",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [activeTab, setActiveTab] = useState<ActiveTab>("pending");

  const loaded = useRef(false);

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
          navigate("/dashboard", { replace: true });
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

        loaded.current = true;
        setSessionStatus("active");

        timer = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          navigate("/login", { replace: true });
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
    navigate("/login", { replace: true });
  };

  /** First-time decision on a pending user */
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

  /** Re-decision on an already approved / rejected user */
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
      <div className="min-h-screen flex items-center justify-center">
        Checking admin session...
      </div>
    );
  }
  if (sessionStatus === "kicked") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Session expired
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── derived lists ─────────────────────────────────────────────────────────────

  const decidedUsers = allUsers.filter((u) => u.status !== "pending");

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">
      <TopBar
        appName="G-TRISP"
        user={user!}
        notificationCount={unreadCount}
        onLogout={logout}
      />

      <main className="p-8">
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow p-6 border-t-4 border-amber-500">
          {/* ── header ── */}
          <div className="flex justify-between mb-6">
            <h1 className="text-3xl font-bold text-blue-900">
              Admin Control Panel
            </h1>
          </div>

          {/* ── welcome banner ── */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
            <h2 className="text-xl font-semibold">Welcome {user?.username}</h2>
            <p>Role : {user?.role}</p>
          </div>

          {/* ── info grid ── */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="border rounded-xl p-6">
              <h3 className="font-bold">System Status</h3>
              <p>{adminData?.message}</p>
            </div>

            <div className="border rounded-xl p-6">
              <h3 className="font-bold">Recent Notifications</h3>
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-500">No notifications yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {notifications.slice(0, 5).map((n) => (
                    <li
                      key={n.id}
                      className={
                        n.is_read
                          ? "text-sm rounded-lg p-2 bg-gray-50 text-gray-500"
                          : "text-sm rounded-lg p-2 bg-amber-50 text-gray-800"
                      }
                    >
                      {n.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ── shared error banner ── */}
          {actionError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
              {actionError}
            </div>
          )}

          {/* ── tab bar ── */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition ${
                activeTab === "pending"
                  ? "bg-white border border-b-white border-gray-200 text-blue-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Pending Approvals
              {pendingUsers.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500 text-white text-xs">
                  {pendingUsers.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("all")}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition ${
                activeTab === "all"
                  ? "bg-white border border-b-white border-gray-200 text-blue-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All Users
              <span className="ml-2 text-xs text-gray-400 font-normal">
                ({allUsers.length})
              </span>
            </button>
          </div>

          {/* ══ TAB: PENDING ══════════════════════════════════════════════════ */}
          {activeTab === "pending" && (
            <div className="border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Pending User Approvals</h3>
                <span className="text-sm text-gray-500">
                  {pendingUsers.length} awaiting review
                </span>
              </div>

              {pendingUsers.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No users waiting for approval.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="py-2 pr-4">Username</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Registered</th>
                        <th className="py-2 pr-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingUsers.map((pu) => (
                        <tr key={pu.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">
                            {pu.username}
                          </td>
                          <td className="py-3 pr-4 text-gray-600">
                            {pu.email}
                          </td>
                          <td className="py-3 pr-4 text-gray-500">
                            {pu.created_at
                              ? new Date(pu.created_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex justify-end gap-2">
                              <button
                                disabled={actionLoadingId === pu.id}
                                onClick={() => handleDecision(pu.id, "approve")}
                                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                disabled={actionLoadingId === pu.id}
                                onClick={() => handleDecision(pu.id, "reject")}
                                className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB: ALL USERS ════════════════════════════════════════════════ */}
          {activeTab === "all" && (
            <div className="border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">User Management</h3>
                <span className="text-sm text-gray-500">
                  {decidedUsers.length} decided user
                  {decidedUsers.length !== 1 ? "s" : ""}
                </span>
              </div>

              <p className="text-xs text-gray-400 mb-4">
                You can revoke or reinstate access for any non-admin user below.
                Pending users must be approved or rejected from the{" "}
                <button
                  className="underline text-blue-600"
                  onClick={() => setActiveTab("pending")}
                >
                  Pending Approvals
                </button>{" "}
                tab.
              </p>

              {decidedUsers.length === 0 ? (
                <p className="text-sm text-gray-500">No decided users yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="py-2 pr-4">Username</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Registered</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4 text-right">Change Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decidedUsers.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">
                            {u.username}
                          </td>
                          <td className="py-3 pr-4 text-gray-600">{u.email}</td>
                          <td className="py-3 pr-4 text-gray-500">
                            {u.created_at
                              ? new Date(u.created_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={u.status} />
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex justify-end gap-2">
                              {u.status === "approved" ? (
                                <button
                                  disabled={actionLoadingId === u.id}
                                  onClick={() =>
                                    handleStatusChange(u.id, "rejected")
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  Revoke Access
                                </button>
                              ) : (
                                <button
                                  disabled={actionLoadingId === u.id}
                                  onClick={() =>
                                    handleStatusChange(u.id, "approved")
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  Reinstate Access
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
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
