// frontend/src/features/dashboard/GujaratOverview.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import API from "../../api/axios";
import type { User } from "../../types/user";
import TopBar from "../../components/layout/TopBar";
import GujaratOverviewMap from "../../components/maps/GujaratOverviewMap";
import { ROUTES } from "../../config/constants";
import { TOPBAR_HEIGHT_PX } from "../../config/layout";

export default function GujaratOverview() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);

  useEffect(() => {
    let active = true;
    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;
        if (res.data.role === "admin") {
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
  }, [navigate]);

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

  return (
    <div className="min-h-screen bg-[#F1F4FB] flex flex-col">
      <TopBar
        appName="G-TRISP"
        user={user}
        showNotificationBell={false}
        onLogout={logout}
      />

      <main
        className="flex-1 flex flex-col"
        style={{ paddingTop: `${TOPBAR_HEIGHT_PX}px` }}
      >
        <div className="px-6 py-4 flex items-center gap-2">
          <MapPin size={16} className="text-[#1e3a8a]" />
          <div>
            <h1 className="text-lg font-bold text-[#1A1D2E]">
              Gujarat Road Accident Overview
            </h1>
            <p className="text-xs text-[#6B7299]">
              Hover over a district to see accident totals. Click a district to
              explore detailed analytics.
            </p>
          </div>
        </div>

        <div
          className="flex-1 mx-6 mb-6 rounded-2xl overflow-hidden shadow-xl border border-[#E4E8F4] relative"
          style={{ minHeight: "70vh" }}
        >
          <GujaratOverviewMap />
        </div>
      </main>
    </div>
  );
}
