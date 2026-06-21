// frontend/src/components/layout/TopBar.tsx

import { ChevronDown } from "lucide-react";

import NotificationBell from "./NotificationBell";
import type { User } from "../../types/user";

interface Props {
  appName: string;
  user: User;
  notificationCount?: number;
}

function TopBar({ appName, user, notificationCount = 0 }: Props) {
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
      "
    >
      {/* LEFT SECTION - BRAND */}

      <div
        className="
        flex
        items-center
        gap-3
        "
      >
        {/* <div
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
        </div> */}

        <div>
          <h1
            className="
            text-xl
            font-bold

            bg-gradient-to-r
            from-blue-900
            via-green-600
            to-amber-500

            bg-clip-text
            text-transparent
            "
          >
            {appName}
          </h1>

          {/* <p
            className="
            text-xs
            text-slate-500
            "
          >
            Road Safety Analytics
          </p> */}
        </div>
      </div>

      {/* RIGHT SECTION */}

      <div
        className="
        flex
        items-center
        gap-6
        "
      >
        <NotificationBell count={notificationCount} />

        {/* PROFILE */}

        <div
          className="
          flex
          items-center
          gap-3

          px-3
          py-2

          rounded-full

          cursor-pointer

          hover:bg-slate-50

          transition
          "
        >
          {/* LOCAL AVATAR */}

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

            {/* <p
              className="
              text-xs
              capitalize
              text-slate-500
              "
            >
              {user.role}
            </p> */}
          </div>

          <ChevronDown
            size={18}
            className="
            text-slate-500
            "
          />
        </div>
      </div>
    </header>
  );
}

export default TopBar;
