// frontend/src/features/dashboard/Dashboard.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../api/axios";
import TopBar from "../../components/layout/Topbar";

// 1. Update User interface to include role
interface User {
  id: number;
  username: string;
  email: string;
  role: string; 
}

const SESSION_POLL_INTERVAL_MS = 5_000;

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sessionStatus, setSessionStatus] = useState<
    "checking" | "active" | "kicked"
  >("checking");

  const hasInitiallyLoaded = useRef(false);

  useEffect(() => {
    let isSubscribed = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (!isSubscribed) return;

      try {
        const response = await API.get<User>("/auth/me");

        if (!isSubscribed) return;

        // 2. Add this check: if the logged-in user is an admin, redirect them.
        if (response.data.role === "admin") {
          navigate("/admin", { replace: true });
          return;
        }

        setUser(response.data);
        setSessionStatus("active");
        hasInitiallyLoaded.current = true;

        timeoutId = setTimeout(poll, SESSION_POLL_INTERVAL_MS);
      } catch (error: any) {
        if (!isSubscribed) return;

        const status = error?.response?.status;

        if (status === 401) {
          if (!hasInitiallyLoaded.current) {
            navigate("/signup", { replace: true });
            return;
          }

          setSessionStatus("kicked");
          return;
        }

        console.warn("[Dashboard] Temporary auth check failure. Retrying...", {
          status,
          detail: error?.response?.data,
          message: error?.message,
        });

        timeoutId = setTimeout(poll, 1000);
      }
    };

    poll();

    return () => {
      isSubscribed = false;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [navigate]);

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch {
      // Navigate anyway even if logout request fails.
    }

    navigate("/login", { replace: true });
  };

  if (sessionStatus === "checking") {
    return (
  <div className="min-h-screen bg-gray-50">


    <TopBar
      appName="G-TRISP"
      user={user!}
      notificationCount={0}
    />



    <main
    className="
    flex
    justify-center
    px-4
    py-10
    "
    >


      <div
      className="
      w-full
      max-w-xl
      bg-white
      rounded-2xl
      shadow-md
      p-8
      border-t-4
      border-green-600
      "
      >



        <div
        className="
        flex
        justify-between
        items-center
        mb-6
        "
        >


          <h1
          className="
          text-2xl
          font-bold
          text-blue-900
          "
          >

            Dashboard

          </h1>




          <button
            onClick={logout}
            className="
            border
            rounded-lg
            px-3
            py-2
            text-sm
            hover:bg-gray-50
            "
          >

            Log out

          </button>


        </div>




        {user && (


        <div
        className="
        border
        rounded-xl
        overflow-hidden
        "
        >


          <div className="p-4 border-b">

            Username:
            {" "}
            <b>{user.username}</b>

          </div>



          <div className="p-4 border-b">

            Email:
            {" "}
            <b>{user.email}</b>

          </div>



          <div className="p-4">

            Role:
            {" "}
            <b className="uppercase">
              {user.role}
            </b>

          </div>



        </div>


        )}



      </div>



    </main>


  </div>
);
  }

  if (sessionStatus === "kicked") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Session terminated
          </h2>

          <p className="text-sm text-gray-500 mb-6">
            Your session expired or your account was signed in from another
            location.
          </p>

          <button
            onClick={() => navigate("/login", { replace: true })}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold
                                   text-white hover:bg-indigo-700 transition focus:outline-none
                                   focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

          <button
            onClick={logout}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium
                                   text-gray-700 hover:bg-gray-50 transition focus:outline-none
                                   focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Log out
          </button>
        </div>

        {user && (
          <div className="space-y-4">
            <div
              className="flex items-center gap-2 text-sm font-medium text-green-700
                                        bg-green-50 border border-green-200 rounded-lg px-3 py-2"
            >
              Session active
            </div>

            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              <div className="px-4 py-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                  Username
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {user.username}
                </p>
              </div>

              <div className="px-4 py-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                  Email
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {user.email}
                </p>
              </div>

              <div className="px-4 py-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                  User ID
                </p>
                <p className="text-sm font-medium text-gray-900">#{user.id}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;