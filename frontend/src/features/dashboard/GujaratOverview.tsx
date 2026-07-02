// frontend/src/features/dashboard/GujaratOverview.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import API from "../../api/axios";
import type { User } from "../../types/user";
import TopBar from "../../components/layout/TopBar";
import GujaratChoroplethMap from "../../components/maps/GujaratChoroplethMap";
import GujaratInsightsPanel from "../../components/dashboard/GujaratInsightsPanel";
import { ROUTES } from "../../config/constants";

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
    <div className="h-screen bg-[#F1F4FB] flex flex-col overflow-hidden">
      <TopBar
        appName="G-TRISP"
        user={user}
        showNotificationBell={false}
        onLogout={logout}
      />

      {/* NO paddingTop here — TopBar is in normal flow, not position:fixed */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* Header row — compact spacing */}
        <div className="px-6 pt-3 pb-2 flex items-center gap-2 shrink-0">
          <MapPin size={16} className="text-[#1e3a8a]" />
          <div>
            <h1 className="text-lg font-bold text-[#1A1D2E]">
              Gujarat Road Accident Overview
            </h1>
            <p className="text-xs text-[#6B7299]">
              Hover a district to see its name. Click to explore its detailed
              analytics.
            </p>
          </div>
        </div>

        {/* Main content grid: 60% map | 40% insights */}
        <div className="flex-1 min-h-0 mx-6 mb-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Map panel — 60% width (3 of 5 cols) */}
          <div className="lg:col-span-3 relative rounded-2xl overflow-hidden shadow-xl border border-[#E4E8F4] bg-white min-h-[420px]">
            <GujaratChoroplethMap />
          </div>

          {/* Insights panel — 40% width (2 of 5 cols) */}
          <div className="lg:col-span-2 rounded-2xl border border-[#E4E8F4] bg-white shadow-xl p-4 min-h-0 overflow-y-auto no-scrollbar">
            <GujaratInsightsPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
