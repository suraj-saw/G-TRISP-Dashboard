/**
 * @file TopBar.tsx
 * @description The primary global application header.
 * @responsibility Displays branding, toggles the sidebar, provides navigation to the Admin Panel, and manages the user profile dropdown including the logout flow.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, PanelRight, Mail, Info } from "lucide-react";

import NotificationBell from "./NotificationBell";
import type { User } from "../../types/user";
import { TOPBAR_HEIGHT_PX, TOPBAR_Z_INDEX } from "../../config/layout";
import ConfirmDialog from "../common/ConfirmDialog";
import { ROUTES } from "../../config/constants";

/**
 * Props for the TopBar component.
 */
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

/**
 * TopBar Component
 * @state_management Controls the profile dropdown visibility (`open`) and the logout confirmation dialog (`logoutDialogOpen`).
 * @hooks_usage Uses `useNavigate` for routing, `useEffect` for clicking-outside-to-close behavior on the dropdown.
 */
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

  // State for toggling the user profile dropdown menu
  const [open, setOpen] = useState(false);

  // State for toggling the logout confirmation modal
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  // Ref to track clicks outside the dropdown menu
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Effect to handle "click outside" logic for the user dropdown.
   * Closes the dropdown if the user clicks anywhere else on the document.
   */
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

  /**
   * Executes the actual logout process and closes all menus.
   */
  const handleLogoutConfirm = () => {
    setLogoutDialogOpen(false);
    setOpen(false);
    onLogout();
  };

  /**
   * Dismisses the logout confirmation dialog without logging out.
   */
  const handleLogoutCancel = () => {
    setLogoutDialogOpen(false);
  };

  return (
    <>
      <header
        style={{ height: `${TOPBAR_HEIGHT_PX}px` }}
      className={`
        ${TOPBAR_Z_INDEX}
        w-full
        flex items-center justify-between
        px-6
        bg-white/80 backdrop-blur-md
        border-b border-slate-100
      `}
    >
      {/* LEFT SIDE: Branding */}
      <div className="flex items-center gap-4">
        {/* App Title */}
        <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-indigo-950 bg-clip-text text-transparent">
          {appName}
        </h1>
      </div>

      {/* RIGHT SIDE: Navigation & Profile Dropdown */}
      <div className="flex items-center gap-3">
        {/* About Button */}
        <button
          onClick={() => navigate(ROUTES.ABOUT)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600"
          aria-label="About G-TRISP"
        >
          <Info
            size={16}
            className="text-slate-400 group-hover:text-indigo-600"
          />
          <span className="hidden lg:inline">About</span>
        </button>

        {/* Admin Panel Button */}
        {adminPanelPath && (
          <button
            onClick={() => navigate(adminPanelPath)}
            className="
              flex items-center gap-2 px-4 py-1.5 
              rounded-xl border border-slate-200 bg-white 
              text-sm font-semibold text-slate-700 shadow-sm
              hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900
              transition-all active:scale-[0.98]
            "
          >
            <span className="hidden sm:inline">Admin Panel</span>
          </button>
        )}

        {/* Notification Bell */}
        {showNotificationBell && (
          <div className="p-0.5 rounded-xl hover:bg-slate-50 transition-colors">
            <NotificationBell count={notificationCount} />
          </div>
        )}

        {/* Divider */}
        <span className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden />

        {/* User Profile Dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="
              flex items-center gap-2.5
              p-1.5 pr-3
              rounded-full
              border border-transparent
              hover:bg-slate-50 hover:border-slate-100
              transition-all duration-200
            "
          >
            <div
              className="
                h-8 w-8
                rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500
                flex items-center justify-center
                text-white text-sm font-bold
                shadow-sm shadow-indigo-200
              "
            >
              {user.username.charAt(0).toUpperCase()}
            </div>

            <span className="hidden md:block text-sm font-semibold text-slate-700">
              {user.username}
            </span>

            <ChevronDown
              size={14}
              className={`text-slate-400 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* DROPDOWN MENU */}
          {open && (
            <div
              role="menu"
              style={{
                top: `${TOPBAR_HEIGHT_PX - 4}px`,
                fontFamily: '"Public Sans", system-ui, sans-serif',
              }}
              className="
                absolute right-0
                w-80 mt-2
                rounded-2xl
                bg-white
                border border-slate-100
                shadow-[0_20px_50px_rgba(79,70,229,0.12)]
                overflow-hidden
                z-50
                animate-in fade-in slide-in-from-top-2 duration-200
              "
            >
              {/* DROPDOWN HEADER */}
              <div className="px-5 pt-6 pb-5 bg-gradient-to-br from-indigo-900 to-slate-900">
                <div className="flex items-center gap-3.5">
                  <div
                    className="
                      h-12 w-12 shrink-0
                      rounded-full
                      bg-white/10
                      ring-2 ring-white/20
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
                        bg-indigo-500/30 backdrop-blur-md
                        px-2.5 py-0.5
                        text-[11px] font-bold uppercase tracking-wider text-indigo-200
                      "
                    >
                      {user.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* DROPDOWN BODY */}
              <div className="p-2">
                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Mail size={15} className="text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Email Address
                    </p>
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="my-1 h-px bg-slate-100" />

                {/* LOGOUT TRIGGER */}
                <button
                  onClick={() => setLogoutDialogOpen(true)}
                  className="
                    w-full
                    flex items-center gap-3
                    rounded-xl
                    px-3 py-2.5
                    text-sm font-semibold text-red-600
                    hover:bg-red-50/60
                    transition-all
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

        {/* Divider */}
        {onToggleSidebar && (
          <span className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden />
        )}

        {/* Sidebar Toggle */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-pressed={sidebarOpen}
            className="
              group
              h-9 w-9
              flex items-center justify-center
              rounded-xl
              border border-slate-200 bg-white
              text-slate-500 shadow-sm
              hover:border-indigo-600 hover:bg-indigo-50 hover:text-indigo-600
              active:scale-95
              transition-all duration-200
            "
          >
            <PanelRight
              size={18}
              strokeWidth={2}
              className={`transition-transform duration-300 ${
                sidebarOpen ? "" : "rotate-180"
              }`}
            />
          </button>
        )}
      </div>
    </header>

      {/* 
        LOGOUT CONFIRMATION MODAL 
        Now properly centered based on ConfirmDialog's flex layout 
      */}
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
    </>
  );
}

export default TopBar;
