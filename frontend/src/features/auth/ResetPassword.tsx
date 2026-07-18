/**
 * @file ResetPassword.tsx
 * @description React component for completing the password reset loop using a secure token.
 * @responsibility Validates the reset token immediately on mount via the backend, and then processes the submission of a new password payload.
 * @dependencies react-router-dom (useSearchParams), axios
 */
import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import API from "../../api/axios";
import { ROUTES } from "../../config/constants";

/**
 * ResetPassword Component
 * @component_responsibility Manages the final stage of password recovery. Ensures the URL token is valid before letting the user type a new password, and redirects them to login upon success.
 * @state_management Manages the dual-password form state (`new_password`, `confirm_password`), API transaction status (`verifying`, `idle`, `loading`, `success`, `invalid`), and error/success messages.
 * @hooks_usage Uses `useSearchParams` to extract the `token` from the URL, and `useEffect` to fire the token validation API request on mount.
 * @returns {JSX.Element} The rendered token-validation view, reset form, or feedback state.
 */
function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [form, setForm] = useState({ new_password: "", confirm_password: "" });
  const [status, setStatus] = useState<"verifying" | "idle" | "loading" | "success" | "invalid">("verifying");
  const [message, setMessage] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  // Pre-validate token on mount
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      setMessage("No reset token provided.");
      setTokenValid(false);
      return;
    }

    const verifyToken = async () => {
      try {
        await API.get(`/auth/reset-password/verify?token=${token}`);
        setStatus("idle");
        setTokenValid(true);
      } catch (err: any) {
        setStatus("invalid");
        setMessage(err?.response?.data?.detail || "Invalid or expired reset token.");
        setTokenValid(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (status === "invalid") {
      setStatus("idle");
      setMessage(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (form.new_password !== form.confirm_password) {
      setStatus("invalid");
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("loading");
    setMessage(null);

    try {
      const res = await API.post("/auth/reset-password", {
        token,
        new_password: form.new_password,
      });
      setStatus("success");
      setMessage(res.data.message || "Password successfully reset.");
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate(ROUTES.LOGIN, { replace: true });
      }, 3000);
      
    } catch (err: any) {
      setStatus("invalid");
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        setMessage(detail.map((d: any) => d.msg.replace("Value error, ", "")).join(" · "));
      } else if (typeof detail === "string") {
        setMessage(detail);
      } else {
        setMessage("An error occurred. Please try again.");
      }
    }
  };

  if (status === "verifying") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-sm text-gray-500">Verifying reset token...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Set New Password</h2>
        <p className="text-sm text-gray-500 mb-6">
          Please enter your new password below.
        </p>

        {status === "success" && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
            {message} Redirecting to login...
          </div>
        )}

        {status === "invalid" && message && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        )}

        {tokenValid && status !== "success" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                id="new_password"
                type="password"
                name="new_password"
                placeholder="••••••••"
                value={form.new_password}
                onChange={handleChange}
                required
                disabled={status === "loading"}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           placeholder-gray-400 focus:outline-none focus:ring-2
                           focus:ring-indigo-500 focus:border-transparent transition
                           disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500">
                At least 8 characters, including an uppercase letter, a number, and a special character.
              </p>
            </div>
            
            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirm_password"
                type="password"
                name="confirm_password"
                placeholder="••••••••"
                value={form.confirm_password}
                onChange={handleChange}
                required
                disabled={status === "loading"}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           placeholder-gray-400 focus:outline-none focus:ring-2
                           focus:ring-indigo-500 focus:border-transparent transition
                           disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading" || !form.new_password || !form.confirm_password}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold
                         text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                         transition"
            >
              {status === "loading" ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to={ROUTES.LOGIN} className="text-sm font-medium text-indigo-600 hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
