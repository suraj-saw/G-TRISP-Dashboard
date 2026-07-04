// frontend/src/App.tsx
import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import API from "./api/axios";
import { ROUTES } from "./config/constants";

import Signup from "./features/auth/Register";
import Login from "./features/auth/Login";
import ForgotPassword from "./features/auth/ForgotPassword";
import ResetPassword from "./features/auth/ResetPassword";
import GujaratOverview from "./features/dashboard/GujaratOverview";
import DistrictDashboard from "./features/dashboard/DistrictDashboard";
import AdminDashboard from "./features/dashboard/AdminDashboard";
import AdminPanel from "./features/dashboard/AdminPanel";
import AccidentsPage from "./features/dashboard/AccidentsPage";

function RootHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const res = await API.get("/auth/me");
        if (!cancelled) {
          const destination =
            res.data.role === "admin" ? ROUTES.ADMIN : ROUTES.DASHBOARD;
          navigate(destination, { replace: true });
        }
      } catch {
        if (!cancelled) {
          navigate(ROUTES.SIGNUP, { replace: true });
        }
      }
    };

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        Loading…
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.HOME} element={<RootHandler />} />
        <Route path={ROUTES.SIGNUP} element={<Signup />} />
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
        <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />
        <Route path={ROUTES.DASHBOARD} element={<GujaratOverview />} />
        <Route
          path={ROUTES.DISTRICT_DASHBOARD}
          element={<DistrictDashboard />}
        />
        <Route path={ROUTES.ADMIN} element={<AdminDashboard />} />
        <Route path={ROUTES.ADMIN_PANEL} element={<AdminPanel />} />
        <Route path={ROUTES.ADMIN_ACCIDENTS} element={<AccidentsPage />} />
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
