// frontend/src/features/dashboard/Dashboard.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import API from "../../api/axios";
import TopBar from "../../components/layout/Topbar";

import type { User } from "../../types/user";

const SESSION_POLL_INTERVAL_MS = 5000;

function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);

  const [sessionStatus, setSessionStatus] = useState<
    "checking" | "active" | "kicked"
  >("checking");

  const loaded = useRef(false);

  useEffect(() => {
    let active = true;

    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const response = await API.get<User>("/auth/me");

        if (!active) return;

        // admin users cannot access normal dashboard
        if (response.data.role === "admin") {
          navigate("/admin", {
            replace: true,
          });

          return;
        }

        setUser(response.data);

        loaded.current = true;

        setSessionStatus("active");

        timer = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      } catch (error: any) {
        if (!active) return;

        if (error?.response?.status === 401) {
          // Immediately redirect to login instead of setting the status to "kicked"
          navigate("/login", {
            replace: true,
          });

          return;
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

    navigate("/login", {
      replace: true,
    });
  };

  // =============================
  // LOADING SCREEN
  // =============================

  if (sessionStatus === "checking") {
    return (
      <div
        className="
        min-h-screen
        flex
        items-center
        justify-center
        bg-gray-50
        "
      >
        Checking session...
      </div>
    );
  }

  // =============================
  // SESSION REMOVED
  // =============================

  // We can leave this here as a fallback, but the redirect above will handle the navigation
  if (sessionStatus === "kicked") {
    return (
      <div
        className="
        min-h-screen
        flex
        items-center
        justify-center
        "
      >
        Session expired. Please login again.
      </div>
    );
  }

  // =============================
  // MAIN DASHBOARD
  // =============================

  return (
    <div
      className="
      min-h-screen
      bg-gray-50
      "
    >
      <TopBar
        appName="G-TRISP"
        user={user!}
        notificationCount={0}
        onLogout={logout}
      />

      <main
        className="
        p-8
        "
      >
        <div
          className="
          max-w-5xl
          mx-auto

          bg-white

          rounded-xl

          shadow

          p-6

          border-t-4
          border-green-600
          "
        >
          <div
            className="
            flex
            justify-between
            items-center

            mb-6
            "
          >
            <h1
              className="
              text-3xl
              font-bold
              text-blue-900
              "
            >
              User Dashboard
            </h1>
          </div>

          <div
            className="
            bg-green-50

            border
            border-green-200

            rounded-xl

            p-5
            "
          >
            <h2
              className="
              text-xl
              font-semibold
              text-green-800
              "
            >
              Welcome {user?.username}
            </h2>

            <p
              className="
              text-gray-600
              "
            >
              {user?.email}
            </p>

            <p
              className="
              mt-2
              capitalize
              "
            >
              Role : {user?.role}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
