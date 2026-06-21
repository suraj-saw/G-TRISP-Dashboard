import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import API from "../../api/axios";
import TopBar from "../../components/layout/Topbar";

import type { User } from "../../types/user";

const SESSION_POLL_INTERVAL_MS = 5000;

function AdminDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [adminData, setAdminData] = useState<any>(null);

  const [sessionStatus, setSessionStatus] = useState<
    "checking" | "active" | "kicked"
  >("checking");

  const loaded = useRef(false);

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

        loaded.current = true;

        setSessionStatus("active");

        timer = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          if (!loaded.current) {
            navigate("/login", { replace: true });

            return;
          }

          setSessionStatus("kicked");
        }
      }
    };

    poll();

    return () => {
      active = false;

      clearTimeout(timer);
    };
  }, [navigate]);

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch {}

    navigate("/login", { replace: true });
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

  return (
    <div className="min-h-screen bg-gray-100">
      <TopBar appName="G-TRISP" user={user!} notificationCount={3} />

      <main className="p-8">
        <div
          className="
max-w-6xl
mx-auto
bg-white
rounded-xl
shadow
p-6
border-t-4
border-amber-500
"
        >
          <div className="flex justify-between mb-6">
            <h1 className="text-3xl font-bold text-blue-900">
              Admin Control Panel
            </h1>

            <button
              onClick={logout}
              className="
bg-red-500
text-white
px-4
py-2
rounded-lg
"
            >
              Logout
            </button>
          </div>

          <div
            className="
bg-green-50
border
border-green-200
rounded-xl
p-5
mb-6
"
          >
            <h2 className="text-xl font-semibold">Welcome {user?.username}</h2>

            <p>Role : {user?.role}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="border rounded-xl p-6">
              <h3 className="font-bold">System Status</h3>

              <p>{adminData?.message}</p>
            </div>

            <div className="border rounded-xl p-6">
              <h3 className="font-bold">Quick Actions</h3>

              <p>More widgets coming...</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
