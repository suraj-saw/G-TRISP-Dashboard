// frontend/src/features/dashboard/GujaratOverview.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import API from "../../api/axios";
import type { User } from "../../types/user";
import type { Notification } from "../../types/notification";
import TopBar from "../../components/layout/TopBar";
import GujaratChoroplethMap from "../../components/maps/GujaratChoroplethMap";
import GujaratInsightsPanel from "../../components/dashboard/GujaratInsightsPanel";
import { ROUTES } from "../../config/constants";
import { DistrictInsightsProvider } from "../../context/DistrictInsightsContext";

interface Props {
  allowAdmin?: boolean;
  showAdminControls?: boolean;
}

export default function GujaratOverview({
  allowAdmin = false,
  showAdminControls = false,
}: Props) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let active = true;
    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;
        if (res.data.role === "admin" && !allowAdmin) {
          navigate(ROUTES.ADMIN, { replace: true });
          return;
        }
        setUser(res.data);
      })
      .catch(() => navigate(ROUTES.LOGIN, { replace: true }))
      .finally(() => {
        if (active) setSessionChecking(false);
      });
    return () => {
      active = false;
    };
  }, [allowAdmin, navigate]);

  useEffect(() => {
    if (!showAdminControls) return;
    API.get<Notification[]>("/admin/notifications")
      .then((res) => setNotifications(res.data))
      .catch(() => {});
  }, [showAdminControls]);

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch {
      /* continue */
    }
    navigate(ROUTES.LOGIN, { replace: true });
  };

  if (sessionChecking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F4FB] text-sm font-semibold text-[#6B7299]">
        Checking session...
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(160deg,#eef2fb 0%,#f5f7fd 60%,#eef2fb 100%)" }}
    >
      <TopBar
        appName="G-TRISP"
        user={user}
        showNotificationBell={showAdminControls}
        notificationCount={unreadCount}
        adminPanelPath={showAdminControls ? ROUTES.ADMIN_PANEL : undefined}
        onLogout={logout}
      />

      <main className="flex-1 flex flex-col min-h-0 px-5 pb-4">
        {/* -- Page header banner -- */}
        <div
          className="shrink-0 mt-3 mb-3 rounded-2xl px-5 py-3 flex items-center gap-3 shadow-md"
          style={{
            background: "linear-gradient(120deg,#1e3a8a 0%,#2c5fcc 55%,#1d4ed8 100%)",
          }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <MapPin size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-white leading-tight">
              Gujarat Road Accident Overview
            </h1>
            <p className="text-[11px] text-blue-200 mt-0.5">
              Hover a district to see its name &middot; Click to explore detailed analytics
            </p>
          </div>
        </div>

        {/* Main content grid: 60% map | 40% insights */}
        <DistrictInsightsProvider>
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Map */}
            <div
              className="lg:col-span-3 relative rounded-2xl overflow-hidden min-h-[420px]"
              style={{
                boxShadow: "0 4px 24px rgba(30,58,138,0.12)",
                border: "1px solid #dde3f5",
                background: "#fff",
              }}
            >
              <GujaratChoroplethMap />
            </div>

            {/* Insights panel — scrollable container */}
            <div
              className="lg:col-span-2 rounded-2xl min-h-0 overflow-hidden p-4"
              style={{
                boxShadow: "0 4px 24px rgba(30,58,138,0.10)",
                border: "1px solid #dde3f5",
                background: "#fff",
              }}
            >
              <div className="p-4">
                <GujaratInsightsPanel />
              </div>
            </div>
          </div>
        </DistrictInsightsProvider>
      </main>
    </div>
  );
}

