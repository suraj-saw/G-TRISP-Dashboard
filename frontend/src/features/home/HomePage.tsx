import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map, LayoutDashboard, ChevronRight } from "lucide-react";
import API from "../../api/axios";
import type { User } from "../../types/user";
import TopBar from "../../components/layout/TopBar";
import { ROUTES, APP_CONFIG } from "../../config/constants";

export default function HomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);

  useEffect(() => {
    let active = true;
    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;
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

  const isAdmin = user.role === "admin" || user.role === "superadmin";

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F4FB]">
      <TopBar
        user={user}
        showNotificationBell={isAdmin}
        adminPanelPath={isAdmin ? ROUTES.ADMIN_PANEL : undefined}
        onLogout={logout}
      />
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden">
        {/* Decorative background shapes */}
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[40%] bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-full max-w-5xl mx-auto relative z-10 flex flex-col items-center my-auto">
          
          {/* Brand Logo Banner */}
          <div className="mb-3 md:mb-4 flex items-center justify-center">
            <img
              src="/api/images/astra_logo_transparent"
              alt="ASTRA Transparent Logo - Advanced Spatiotemporal Traffic Risk Analytics"
              className="h-32 md:h-44 lg:h-48 xl:h-52 w-auto max-w-xl md:max-w-2xl object-contain select-none transition-transform duration-300 hover:scale-[1.01]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/logos/astra_logo_transparent.png";
              }}
            />
          </div>

          <h1 className="sr-only">
            {APP_CONFIG.name} - {APP_CONFIG.fullName} ({APP_CONFIG.hindiName})
          </h1>

          <p className="text-base md:text-lg lg:text-xl text-center text-slate-700 mb-4 md:mb-5 max-w-2xl font-medium tracking-wide">
            Traffic Safety & Incident Intelligence Platform for Gujarat
          </p>
          
          {/* Streamlined Purpose Pill */}
          <div className="bg-white/90 backdrop-blur-xs px-6 py-3 rounded-2xl mb-5 md:mb-6 border border-slate-200/80 shadow-xs w-full max-w-3xl text-center">
            <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-800">Our Purpose: </span>
              To empower stakeholders with actionable data, identifying blackspots, high-risk corridors, and temporal trends to foster data-driven road safety interventions and save lives.
            </p>
          </div>
          
          {/* Dashboard Action Cards */}
          <div className="grid md:grid-cols-2 gap-4 md:gap-6 w-full max-w-4xl">
            {/* State Level Card */}
            <div 
              onClick={() => navigate(ROUTES.STATE_DASHBOARD)}
              className="group cursor-pointer bg-white border border-slate-200 rounded-2xl p-5 transition-all duration-300 hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 flex flex-col"
            >
              <div className="flex items-center gap-3.5 mb-2.5">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Map size={22} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">State Visualization</h3>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mb-3 flex-1 leading-relaxed">
                Show the accident visualization of the overall state with the state boundary only.
              </p>
              <div className="flex items-center text-sm text-blue-600 font-semibold group-hover:gap-2 transition-all">
                View Dashboard <ChevronRight size={16} className="ml-1" />
              </div>
            </div>

            {/* District Level Card */}
            <div 
              onClick={() => navigate(ROUTES.DASHBOARD)}
              className="group cursor-pointer bg-white border border-slate-200 rounded-2xl p-5 transition-all duration-300 hover:shadow-md hover:border-indigo-300 hover:-translate-y-0.5 flex flex-col"
            >
              <div className="flex items-center gap-3.5 mb-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <LayoutDashboard size={22} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">District Level Visualization</h3>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mb-3 flex-1 leading-relaxed">
                Show what we are showing in the state visualization, but customized for a specific district.
              </p>
              <div className="flex items-center text-sm text-indigo-600 font-semibold group-hover:gap-2 transition-all">
                View Dashboard <ChevronRight size={16} className="ml-1" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
