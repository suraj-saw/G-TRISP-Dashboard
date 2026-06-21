import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../api/axios";

interface RegisterForm {
  username: string;
  email: string;
  password: string;
}

// FastAPI validation errors can be a string OR an array of {msg, loc} objects
type FastAPIDetail = string | { msg: string; loc: string[] }[];

function extractErrorMessage(detail: FastAPIDetail): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg.replace("Value error, ", "")).join(" · ");
  }
  return "Something went wrong. Please try again.";
}

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterForm>({
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    API.get("/auth/me")
      .then((res) => {
        if (!cancelled) {
          // Check role when they hit register page with an active session
          if (res.data.role === "admin") {
            navigate("/admin", { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        }
      })
      .catch(() => {
        // Not logged in, stay on Register page.
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await API.post("/auth/register", form);
      setSuccess(true);
    } catch (err: unknown) {
      const detail = (
        err as { response?: { data?: { detail?: FastAPIDetail } } }
      )?.response?.data?.detail;
      setError(
        detail
          ? extractErrorMessage(detail)
          : "Register failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          Create account
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Already registered?{" "}
          <Link
            to="/login"
            className="text-indigo-600 hover:underline font-medium"
          >
            Log in
          </Link>
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success ? (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4 text-sm text-green-800">
            <p className="font-medium mb-1">Account created!</p>
            <p>
              Your account is pending admin approval. You'll be able to log in
              once it's approved.{" "}
              <Link
                to="/login"
                className="text-indigo-600 hover:underline font-medium"
              >
                Back to login
              </Link>
            </p>
          </div>
        ) : (
          <>
            {/* Password rules hint */}
            <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-0.5">
              <p className="font-medium mb-1">Password must contain:</p>
              <p>• At least 8 characters</p>
              <p>• Uppercase &amp; lowercase letters</p>
              <p>• A number and a special character (!@#$%…)</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                {loading ? "Creating account…" : "Sign up"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default Register;
