// frontend/src/features/dashboard/AdminDashboard.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import API from "../../api/axios";
import TopBar from "../../components/layout/Topbar";

import type { User } from "../../types/user";
import type { Notification } from "../../types/notification";

const SESSION_POLL_INTERVAL_MS = 5000;

type SessionStatus = "checking" | "active" | "kicked";

function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");

  const loaded = useRef(false);

  const loadPendingUsers = useCallback(async () => {
    try {
      const res = await API.get<User[]>("/admin/users/pending");
      setPendingUsers(res.data);
    } catch {
      // 401 is handled by the polling loop below
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await API.get<Notification[]>("/admin/notifications");
      setNotifications(res.data);
    } catch {
      // ignore
    }
  }, []);

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

        // Refresh every poll cycle so new registrations show up live
        await Promise.all([loadPendingUsers(), loadNotifications()]);

        loaded.current = true;
        setSessionStatus("active");

        timer = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [navigate, loadPendingUsers, loadNotifications]);

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch {}

    navigate("/login", { replace: true });
  };

  const handleDecision = async (
    userId: number,
    decision: "approve" | "reject"
  ) => {
    setActionLoadingId(userId);
    setActionError(null);

    try {
      await API.post(`/admin/users/${userId}/${decision}`);
      await Promise.all([loadPendingUsers(), loadNotifications()]);
    } catch (err: any) {
      setActionError(
        err?.response?.data?.detail || "Could not update the user. Try again."
      );
    } finally {
      setActionLoadingId(null);
    }
  };

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
          <div className="flex justify-between mb-6">
            <h1 className="text-3xl font-bold text-blue-900">
              Admin Control Panel
            </h1>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
            <h2 className="text-xl font-semibold">Welcome {user?.username}</h2>
            <p>Role : {user?.role}</p>
          </div>

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

          <div className="border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Pending User Approvals</h3>
              <span className="text-sm text-gray-500">
                {pendingUsers.length} awaiting review
              </span>
            </div>

            {actionError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}

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
                    {pendingUsers.map((pendingUser) => (
                      <tr
                        key={pendingUser.id}
                        className="border-b last:border-0"
                      >
                        <td className="py-3 pr-4 font-medium">
                          {pendingUser.username}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {pendingUser.email}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {pendingUser.created_at
                            ? new Date(pendingUser.created_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex justify-end gap-2">
                            <button
                              disabled={actionLoadingId === pendingUser.id}
                              onClick={() =>
                                handleDecision(pendingUser.id, "approve")
                              }
                              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              disabled={actionLoadingId === pendingUser.id}
                              onClick={() =>
                                handleDecision(pendingUser.id, "reject")
                              }
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
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
