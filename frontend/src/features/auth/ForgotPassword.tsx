// frontend/src/features/auth/ForgotPassword.tsx
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import API from "../../api/axios";
import { ROUTES } from "../../config/constants";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (status === "error") {
      setStatus("idle");
      setMessage(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    setMessage(null);
    setResetLink(null);

    try {
      const res = await API.post("/auth/forgot-password", { email });
      setStatus("success");
      setMessage(res.data.message || "If an account exists, a reset link has been sent.");
      if (res.data.reset_link) {
        setResetLink(res.data.reset_link);
      }
    } catch (err: any) {
      setStatus("error");
      const detail = err?.response?.data?.detail;
      setMessage(
        detail 
          ? (typeof detail === "string" ? detail : "Invalid request") 
          : "An error occurred. Please try again later."
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Forgot Password</h2>
        <p className="text-sm text-gray-500 mb-6">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {status === "success" && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
            {resetLink ? (
              <p>A password reset link has been successfully generated.</p>
            ) : (
              <p>{message}</p>
            )}
            
            {resetLink && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <p className="font-semibold text-emerald-900 mb-2">Testing Mode: Link Generated</p>
                <a 
                  href={resetLink} 
                  className="inline-block px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition"
                >
                  Click to Reset Password
                </a>
              </div>
            )}
          </div>
        )}

        {status === "error" && message && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        )}

        {status !== "success" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={email}
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
              disabled={status === "loading" || !email}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold
                         text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                         transition"
            >
              {status === "loading" ? "Sending..." : "Send Reset Link"}
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

export default ForgotPassword;
