import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../api/axios";

interface LoginForm {
  username: string;
  password: string;
}

interface User {
  id: number;
  username: string;
  email: string;
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

function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState<LoginForm>({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSubmittingLogin = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      console.groupCollapsed("[Login] Initial session check");

      try {
        // console.log("Checking /auth/me without refresh-token retry...");

        await API.get<User>("/auth/me", {
          skipAuthRefresh: true,
        });

        // console.log("Existing access session is valid.");

        if (!cancelled && !isSubmittingLogin.current) {
          // console.log("Redirecting existing logged-in user to /dashboard.");
          navigate("/dashboard", { replace: true });
        }
      } catch (err: any) {
        // console.log("No active access session. Staying on login page.");
        // console.log("Status:", err?.response?.status);
        // console.log("Detail:", err?.response?.data?.detail);
      } finally {
        console.groupEnd();
      }
    };

    checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const verifySessionAfterLogin = async () => {
    const delays = [0, 100, 250, 500, 1000];

    console.groupCollapsed("[Login] Verifying session after login");

    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      const delay = delays[attempt];

      if (delay > 0) {
        // console.log(
        //   `Waiting ${delay}ms before verification attempt ${attempt + 1}...`
        // );
        await sleep(delay);
      }

      try {
        // console.log(`Attempt ${attempt + 1}: GET /auth/me`);

        const response = await API.get<User>("/auth/me", {
          skipAuthRefresh: true,
        });

        // console.log("Session verified successfully:", response.data);
        console.groupEnd();

        return true;
      } catch (err: any) {
        console.warn(`Attempt ${attempt + 1} failed.`);
        console.warn("Status:", err?.response?.status);
        console.warn("Detail:", err?.response?.data?.detail);
      }
    }

    console.error("Session was not available after login response.");
    console.groupEnd();

    return false;
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

    console.groupCollapsed("[Login] Submit");

    try {
    //   console.log("Submitting login request for username:", form.username);

      const loginResponse = await API.post("/auth/login", form, {
        skipAuthRefresh: true,
      });

    //   console.log("Login response received:", loginResponse.data);

      const sessionReady = await verifySessionAfterLogin();

      if (!sessionReady) {
        setError(
          "Login succeeded, but the session was not ready. Please try again."
        );
        return;
      }

    //   console.log("Navigating to /dashboard.");
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const detail = (
        err as {
          response?: { data?: { detail?: FastAPIDetail }; status?: number };
        }
      )?.response?.data?.detail;

      console.error("Login failed.");
      console.error(
        "Status:",
        (err as { response?: { status?: number } })?.response?.status
      );
      console.error("Detail:", detail);

      setError(
        detail ? extractErrorMessage(detail) : "Invalid username or password."
      );
    } finally {
      console.groupEnd();
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
            to="/signup"
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
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Username
            </label>

            <input
              id="username"
              type="text"
              name="username"
              placeholder="your_handle"
              value={form.username}
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
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>

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
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
