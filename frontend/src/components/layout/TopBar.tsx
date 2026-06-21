// frontend/src/components/layout/TopBar.tsx

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";

import NotificationBell from "./NotificationBell";
import type { User } from "../../types/user";

interface Props {
  appName: string;
  user: User;
  notificationCount?: number;
  onLogout: () => void;
}

function TopBar({ appName, user, notificationCount = 0, onLogout }: Props) {
  const [open, setOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  /*
    Close profile dropdown
    when user clicks outside
  */
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  return (
    <header
      className="
      h-20
      w-full
      px-8

      flex
      items-center
      justify-between

      bg-white

      border-b
      border-slate-200

      shadow-sm

      relative
      z-40
      "
    >
      {/* LEFT SIDE - BRAND */}

      <div
        className="
        flex
        items-center
        gap-3
        "
      >
        <div
          className="
          h-11
          w-11

          rounded-xl

          bg-[radial-gradient(circle_at_top_left,#16a34a,#1e3a8a)]

          flex
          items-center
          justify-center

          text-white
          font-bold
          text-xl
          "
        >
          {appName.charAt(0)}
        </div>

        <div>
          <h1
            className="
            text-xl
            font-bold

            bg-gradient-to-r
            from-blue-900
            via-green-600
            to-amber-500

            text-transparent
            bg-clip-text
            "
          >
            {appName}
          </h1>

          <p
            className="
            text-xs
            text-slate-500
            "
          >
            Road Safety Analytics
          </p>
        </div>
      </div>

      {/* RIGHT SIDE */}

      <div
        className="
        flex
        items-center
        gap-6
        "
      >
        <NotificationBell count={notificationCount} />

        {/* PROFILE WRAPPER */}

        <div ref={dropdownRef} className="relative">
          {/* PROFILE BUTTON */}

          <button
            onClick={() => setOpen((prev) => !prev)}
            className="
            flex
            items-center
            gap-3

            px-3
            py-2

            rounded-full

            hover:bg-slate-50

            transition
            "
          >
            {/* AVATAR */}

            <div
              className="
              h-10
              w-10

              rounded-full

              bg-[radial-gradient(circle_at_top_left,#22c55e,#2563eb)]

              flex
              items-center
              justify-center

              text-white
              font-bold
              "
            >
              {user.username.charAt(0).toUpperCase()}
            </div>

            {/* USER INFO */}

            <div
              className="
              hidden
              md:block

              text-left
              "
            >
              <p
                className="
                font-semibold
                text-slate-800
                "
              >
                {user.username}
              </p>

              <p
                className="
                text-xs
                capitalize
                text-slate-500
                "
              >
                {user.role}
              </p>
            </div>

            <ChevronDown
              size={18}
              className={`
              text-slate-500
              transition-transform

              ${open ? "rotate-180" : ""}
              `}
            />
          </button>

          {/* PROFILE DROPDOWN */}

          {open && (
            <div
              className="
              absolute

              right-0
              top-16

              w-72

              bg-white

              rounded-xl

              border
              border-slate-200

              shadow-xl

              overflow-hidden

              z-50
              "
            >
              {/* USER HEADER */}

              <div
                className="
                p-5

                bg-gradient-to-r
                from-blue-50
                to-green-50

                border-b
                "
              >
                <div
                  className="
                  flex
                  items-center
                  gap-3
                  "
                >
                  <div
                    className="
                    h-12
                    w-12

                    rounded-full

                    bg-[radial-gradient(circle_at_top_left,#22c55e,#2563eb)]

                    flex
                    items-center
                    justify-center

                    text-white
                    font-bold
                    text-lg
                    "
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <h3
                      className="
                      font-bold
                      text-slate-800
                      "
                    >
                      {user.username}
                    </h3>

                    <p
                      className="
                      text-sm
                      text-slate-500
                      truncate
                      "
                    >
                      {user.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* DETAILS */}

              <div className="p-4">
                <div
                  className="
                  mb-4
                  "
                >
                  <p
                    className="
                    text-sm
                    text-slate-400
                    "
                  >
                    Role
                  </p>

                  <p
                    className="
                    font-semibold
                    capitalize
                    "
                  >
                    {user.role}
                  </p>
                </div>

                {/* LOGOUT */}

                <button
                  onClick={onLogout}
                  className="
                  w-full

                  flex
                  items-center
                  justify-center
                  gap-2

                  py-2

                  rounded-lg

                  bg-red-500
                  hover:bg-red-600

                  text-white

                  transition
                  "
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;
