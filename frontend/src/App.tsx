// frontend/src/App.tsx
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import API from "./api/axios";

import Signup from "./features/auth/Register";
import Login from "./features/auth/Login";
import Dashboard from "./features/dashboard/Dashboard";
import AdminDashboard from "./features/dashboard/AdminDashboard"; // <-- Import AdminDashboard

function RootHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const res = await API.get("/auth/me");

        if (!cancelled) {
          // Route based on role
          if (res.data.role === "admin") {
            navigate("/admin", { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        }
      } catch {
        if (!cancelled) {
          navigate("/signup", { replace: true });
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
      <div className="flex items-center gap-2 text-sm text-gray-500">Loading...</div>
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
        <Route path="/admin" element={<AdminDashboard />} /> {/* <-- Add the admin route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;