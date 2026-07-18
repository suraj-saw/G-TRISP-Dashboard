// frontend/src/App.tsx
//
// Core Application Entrypoint and Routing Architecture
//
// Context within the stack:
// - Declares the client-side browser navigation paths via React Router DOM.
// - Integrates feature components across Authentication, Dashboards, and Management panels.
// - Features a dynamic runtime authentication landing check (RootHandler) that enforces
//   automatic routing based on server-side user identities and access control levels.

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

// Feature Component Imports
import Signup from "./features/auth/Register";
import Login from "./features/auth/Login";
import ForgotPassword from "./features/auth/ForgotPassword";
import ResetPassword from "./features/auth/ResetPassword";
import GujaratOverview from "./features/dashboard/GujaratOverview";
import DistrictDashboard from "./features/dashboard/DistrictDashboard";
import AdminDashboard from "./features/dashboard/AdminDashboard";
import AdminPanel from "./features/dashboard/AdminPanel";
import AccidentsPage from "./features/dashboard/AccidentsPage";
import AboutPage from "./features/about/AboutPage";

/**
 * RootHandler Component
 *
 * Serves as the intelligent gateway component mapping to the "/" base domain path.
 * - Executes an instantaneous session interrogation check against the Backend API.
 * - Redirects users to their respective workspace depending on their role context.
 * - Extends a splash loading visual state while network traffic is active.
 */
function RootHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // A flag to safely handle asynchronous race conditions if the component
    // unmounts before the HTTP promise settles.
    let cancelled = false;

    const checkAuth = async () => {
      try {
        // Query the current user profile from session tokens/cookies
        const res = await API.get("/auth/me");

        // Prevent state modifications or navigation loops if effect was destroyed
        if (!cancelled) {
          // Dynamic authorization determination logic
          const destination =
            res.data.role === "admin" ? ROUTES.ADMIN : ROUTES.DASHBOARD;

          // Use replace:true to pop the loading gate out of the browser history stack,
          // preventing users from hitting the "back" button directly into a re-evaluation block.
          navigate(destination, { replace: true });
        }
      } catch {
        // Fallback to register/signup workspace if request throws an error (e.g., unauthorized)
        if (!cancelled) {
          navigate(ROUTES.SIGNUP, { replace: true });
        }
      }
    };

    checkAuth();

    // Component unmount cleanup function: triggers the cancellation flag
    return () => {
      cancelled = true;
    };
  }, [navigate]); // Core hook dependency safely confined to the navigation instance

  return (
    // Visual placeholder layout container visible while auth state resolves
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        Loading…
      </div>
    </div>
  );
}

/**
 * App Component
 *
 * The root container declaring the core layout tree and application shell framework.
 * Maps deterministic path variables from a centralized registry to explicit UI views.
 */
function App() {
  return (
    // Context provider configuring standard web history-driven routing
    <BrowserRouter>
      <Routes>
        {/* Gateway Entrypoint Routing Handler */}
        <Route path={ROUTES.HOME} element={<RootHandler />} />

        {/* Authentication Lifecycle Segment */}
        <Route path={ROUTES.SIGNUP} element={<Signup />} />
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
        <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />

        {/* Core User Metrics Segment */}
        <Route path={ROUTES.DASHBOARD} element={<GujaratOverview />} />
        <Route path={ROUTES.ABOUT} element={<AboutPage />} />
        <Route
          path={ROUTES.DISTRICT_DASHBOARD}
          element={<DistrictDashboard />}
        />

        {/* High-Privilege Administration Segment */}
        <Route path={ROUTES.ADMIN} element={<AdminDashboard />} />
        <Route path={ROUTES.ADMIN_PANEL} element={<AdminPanel />} />
        <Route path={ROUTES.ADMIN_ACCIDENTS} element={<AccidentsPage />} />

        {/* Global Catch-all / Fallback Route Strategy */}
        {/* Safely catches unmapped paths or typos and pushes context back to the Root Handler */}
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
