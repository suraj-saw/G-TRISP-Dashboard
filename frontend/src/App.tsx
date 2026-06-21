import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import API from "./api/axios";

// Fixed: Corrected the import paths to point to the features directory
import Signup from "./features/auth/Register";
import Login from "./features/auth/Login";
import Dashboard from "./features/dashboard/Dashboard";

function RootHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        await API.get("/auth/me");

        if (!cancelled) {
          navigate("/dashboard", { replace: true });
        }
      } catch {
        if (!cancelled) {
          navigate("/login", { replace: true });
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
        <svg
          className="animate-spin h-5 w-5 text-indigo-600"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
        Loading...
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootHandler />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;