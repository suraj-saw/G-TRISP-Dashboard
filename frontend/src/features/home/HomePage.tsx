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
      
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Decorative background shapes */}
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[40%] bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-8 relative z-10 flex flex-col items-center">
          
          <h1 className="text-3xl md:text-5xl font-extrabold text-center text-slate-800 mb-6 tracking-tight">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{APP_CONFIG.displayName}</span>
          </h1>
          
          <p className="text-lg md:text-xl text-center text-slate-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            <span className="font-semibold text-slate-700">{APP_CONFIG.fullName}</span> provides a comprehensive suite of analytical tools to monitor, evaluate, and prevent road accidents across Gujarat.
          </p>
          
          <div className="bg-white p-6 rounded-2xl mb-10 border border-slate-200 shadow-sm w-full max-w-4xl">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Our Purpose</h3>
            <p className="text-slate-600 leading-relaxed">
              To empower stakeholders with actionable data, identifying blackspots, high-risk corridors, and temporal trends to foster data-driven road safety interventions and save lives.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 w-full max-w-6xl">
            {/* State Level Card */}
            <div 
              onClick={() => navigate(ROUTES.STATE_DASHBOARD)}
              className="group cursor-pointer bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-300 hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 flex flex-col"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Map size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">State Visualization</h3>
              </div>
              <p className="text-slate-500 mb-6 flex-1">
                Show the accident visualization of the overall state with the state boundary only.
              </p>
              <div className="flex items-center text-blue-600 font-semibold group-hover:gap-2 transition-all">
                View Dashboard <ChevronRight size={18} className="ml-1" />
              </div>
            </div>

            {/* District Level Card */}
            <div 
              onClick={() => navigate(ROUTES.DASHBOARD)}
              className="group cursor-pointer bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-300 hover:shadow-lg hover:border-indigo-300 hover:-translate-y-1 flex flex-col"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <LayoutDashboard size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">District Level Visualization</h3>
              </div>
              <p className="text-slate-500 mb-6 flex-1">
                Show what we are showing in the state visualization, but customized for a specific district.
              </p>
              <div className="flex items-center text-indigo-600 font-semibold group-hover:gap-2 transition-all">
                View Dashboard <ChevronRight size={18} className="ml-1" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
