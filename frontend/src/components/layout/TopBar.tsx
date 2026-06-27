// frontend/src/components/layout/TopBar.tsx

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  LogOut,
  PanelLeft,
  Mail,
  ShieldCheck,
  UserCircle,
} from "lucide-react";

import NotificationBell from "./NotificationBell";
import type { User } from "../../types/user";
import { TOPBAR_HEIGHT_PX, TOPBAR_Z_INDEX } from "../../config/layout";
import ConfirmDialog from "../common/ConfirmDialog";

interface Props {
  appName: string;
  user: User;
  notificationCount?: number;
  onLogout: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  showNotificationBell?: boolean;
  adminPanelPath?: string;
}

function TopBar({
  appName,
  user,
  notificationCount = 0,
  onLogout,
  sidebarOpen,
  onToggleSidebar,
  showNotificationBell = true,
  adminPanelPath,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeDropdown = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, []);

  const handleLogoutConfirm = () => {
    setLogoutDialogOpen(false);
    setOpen(false);
    onLogout();
  };

  const handleLogoutCancel = () => {
    setLogoutDialogOpen(false);
  };
  return (
    <header
      style={{ height: `${TOPBAR_HEIGHT_PX}px` }}
      className={`
        ${TOPBAR_Z_INDEX}
        w-full
        flex items-center justify-between
        px-5
        bg-white
        border-b border-slate-200
      `}
    >
      {/* LEFT SIDE */}
      <div className="flex items-center gap-3.5">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-pressed={sidebarOpen}
            className="
              group
              h-9 w-9
              flex items-center justify-center
              rounded-lg
              border border-slate-200 bg-white
              text-slate-500
              hover:border-[#1e3a8a] hover:bg-[#1e3a8a] hover:text-white
              active:scale-95
              transition-all duration-150
            "
          >
            <PanelLeft
              size={18}
              strokeWidth={2}
              className={`transition-transform duration-300 ${
                sidebarOpen ? "" : "rotate-180"
              }`}
            />
          </button>
        )}

        <span className="hidden sm:block h-6 w-px bg-slate-200" aria-hidden />

        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          {appName}
        </h1>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-2 sm:gap-3">
        {adminPanelPath && (
          <button
            onClick={() => navigate(adminPanelPath)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            {/* <ShieldCheck size={16} className="text-[#1e3a8a]" /> */}
            <span className="hidden sm:inline">Admin Panel</span>
          </button>
        )}

        {showNotificationBell && <NotificationBell count={notificationCount} />}

        <span className="hidden sm:block h-6 w-px bg-slate-200" aria-hidden />

        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="
              flex items-center gap-2.5
              pl-1.5 pr-2.5 py-1.5
              rounded-full
              border border-transparent
              hover:bg-slate-100 hover:border-slate-200
              transition
            "
          >
            <div
              className="
                h-8 w-8
                rounded-full bg-[#1e3a8a]
                flex items-center justify-center
                text-white text-sm font-semibold
                ring-2 ring-white
              "
            >
              {user.username.charAt(0).toUpperCase()}
            </div>

            <span className="hidden md:block text-sm font-semibold text-slate-700">
              {user.username}
            </span>

            <ChevronDown
              size={16}
              className={`text-slate-400 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* DROPDOWN */}
          {open && (
            <div
              role="menu"
              style={{
                top: `${TOPBAR_HEIGHT_PX + 4}px`,
                fontFamily: '"Public Sans", system-ui, sans-serif',
              }}
              className="
                absolute right-0
                w-80
                rounded-2xl
                bg-white
                border border-slate-200
                shadow-[0_16px_48px_rgba(15,23,42,0.16)]
                overflow-hidden
                z-50
              "
            >
              {/* HEADER — institutional navy */}
              <div className="px-5 pt-6 pb-5 bg-[#1e3a8a]">
                <div className="flex items-center gap-3.5">
                  <div
                    className="
                      h-12 w-12 shrink-0
                      rounded-full
                      bg-white/15
                      ring-2 ring-white/25
                      flex items-center justify-center
                      text-lg font-bold text-white
                    "
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white truncate">
                      {user.username}
                    </h3>
                    <span
                      className="
                        mt-1 inline-flex items-center
                        rounded-full
                        bg-white/15
                        px-2.5 py-0.5
                        text-[11px] font-semibold uppercase tracking-wide text-white
                      "
                    >
                      {user.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* BODY — info rows */}
              <div className="p-3">
                <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Mail size={15} className="text-[#1e3a8a]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Email
                    </p>
                    <p className="text-sm text-slate-700 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="my-1 h-px bg-slate-100" />

                {/* LOGOUT */}
                <button
                  onClick={() => setLogoutDialogOpen(true)}
                  className="
                    mt-1 w-full
                    flex items-center gap-3
                    rounded-lg
                    px-3 py-2.5
                    text-sm font-semibold text-red-600
                    hover:bg-red-50 
                    transition
                  "
                >
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-red-50 flex items-center justify-center">
                    <LogOut size={15} />
                  </div>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={logoutDialogOpen}
        title="Sign out"
        message="Are you sure you want to sign out of your account?"
        confirmText="Sign out"
        cancelText="Cancel"
        danger
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
      />
    </header>
  );
}

export default TopBar;
