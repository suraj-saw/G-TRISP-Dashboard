// frontend/src/features/auth/Login.tsx
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../api/axios";
import { ROUTES } from "../../config/constants";

interface LoginForm {
  email: string;
  password: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

type FastAPIDetail = string | { msg: string; loc: string[] }[];

function extractErrorMessage(detail: FastAPIDetail): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg.replace("Value error, ", "")).join(" · ");
  }
  return "Something went wrong. Please try again.";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve the correct post-login destination based on the user's role. */
function destinationFor(user: User): string {
  return user.role === "admin" ? ROUTES.ADMIN : ROUTES.DASHBOARD;
}

function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState<LoginForm>({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSubmittingLogin = useRef(false);

  // Redirect already-authenticated users away from the login page
  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      try {
        const res = await API.get<User>("/auth/me", { skipAuthRefresh: true });
        if (!cancelled && !isSubmittingLogin.current) {
          navigate(destinationFor(res.data), { replace: true });
        }
      } catch {
        // Not logged in — stay on the Login page
      }
    };

    checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  /** Poll /auth/me after login to confirm the session cookie is available. */
  const verifySessionAfterLogin = async (): Promise<User | null> => {
    const delays = [0, 100, 250, 500, 1000];

    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) await sleep(delays[attempt]);
      try {
        const res = await API.get<User>("/auth/me", { skipAuthRefresh: true });
        return res.data;
      } catch {
        // Retry
      }
    }

    console.error("Session was not available after login response.");
    return null;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const loginUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    isSubmittingLogin.current = true;
    setLoading(true);
    setError(null);

    try {
      await API.post("/auth/login", form, { skipAuthRefresh: true });

      const user = await verifySessionAfterLogin();
      if (!user) {
        setError(
          "Login succeeded, but the session was not ready. Please try again."
        );
        return;
      }

      navigate(destinationFor(user), { replace: true });
    } catch (err: unknown) {
      const detail = (
        err as {
          response?: { data?: { detail?: FastAPIDetail }; status?: number };
        }
      )?.response?.data?.detail;

      setError(
        detail ? extractErrorMessage(detail) : "Invalid email or password."
      );
    } finally {
      isSubmittingLogin.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>

        <p className="text-sm text-gray-500 mb-6">
          New here?{" "}
          <Link
            to={ROUTES.SIGNUP}
            className="text-indigo-600 hover:underline font-medium"
          >
            Create an account
          </Link>
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={loginUser} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         placeholder-gray-400 focus:outline-none focus:ring-2
                         focus:ring-indigo-500 focus:border-transparent transition
                         disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <Link
                to={ROUTES.FORGOT_PASSWORD}
                className="text-sm text-indigo-600 hover:underline font-medium"
              >
                Forgot Password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              name="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         placeholder-gray-400 focus:outline-none focus:ring-2
                         focus:ring-indigo-500 focus:border-transparent transition
                         disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold
                       text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                       transition"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
