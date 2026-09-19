/**
 * @file TopBar.tsx
 * @description The primary global application header.
 * @responsibility Displays branding, toggles the sidebar, provides navigation to the Admin Panel, and manages the user profile dropdown including the logout flow.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, LogOut, PanelRight, Mail, Info, UserCircle } from "lucide-react";

import NotificationBell from "./NotificationBell";
import type { User } from "../../types/user";
import { TOPBAR_HEIGHT_PX, TOPBAR_Z_INDEX } from "../../config/layout";
import ConfirmDialog from "../common/ConfirmDialog";
import { ROUTES, APP_CONFIG } from "../../config/constants";

/**
 * Props for the TopBar component.
 */
interface Props {
  appName?: string;
  subTitle?: string;
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
  subTitle,
  user,
  notificationCount = 0,
  onLogout,
  sidebarOpen,
  onToggleSidebar,
  showNotificationBell = true,
  adminPanelPath,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const displayTitle =
    appName ||
    (subTitle ? `${APP_CONFIG.displayName} · ${subTitle}` : APP_CONFIG.displayName);

  // State for toggling the logout confirmation modal
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  /**
   * Executes the actual logout process and closes all menus.
   */
  const handleLogoutConfirm = () => {
    setLogoutDialogOpen(false);
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
          relative ${TOPBAR_Z_INDEX}
          w-full
          flex items-center justify-between
          px-6
          bg-white/80 backdrop-blur-md
          border-b border-slate-100
        `}
      >
        {/* LEFT SIDE: Branding */}
        <div className="flex items-center gap-4">
          {/* App Title / Logo */}
          <button
            type="button"
            onClick={() => navigate(ROUTES.HOME_PAGE)}
            className="flex items-center gap-2 rounded-lg text-left transition-all hover:opacity-80 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
            title="Go to Landing Page"
            aria-label="Go to Landing Page"
          >
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-indigo-950 bg-clip-text text-transparent select-none">
              {displayTitle}
            </h1>
          </button>
        </div>

        {/* RIGHT SIDE: Navigation & Profile Dropdown */}
        <div className="flex items-center gap-3">
          {/* About Button */}
          <button
            onClick={() => navigate(ROUTES.ABOUT)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600"
            aria-label={`About ${APP_CONFIG.name}`}
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
              onClick={() => {
                if (location.pathname.startsWith("/dashboard") || location.pathname === ROUTES.ADMIN) {
                  sessionStorage.setItem("last_dashboard_path", location.pathname);
                }
                navigate(adminPanelPath, { state: { from: location.pathname } });
              }}
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

          {/* User Profile Link & Logout */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => navigate(ROUTES.PROFILE)}
              className="
                flex items-center gap-2.5
                p-1.5 pr-3
                rounded-full
                border border-transparent
                hover:bg-slate-50 hover:border-slate-200
                transition-all duration-200
              "
              title="My Profile"
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
            </button>
            
            <button
              onClick={() => setLogoutDialogOpen(true)}
              className="
                p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 
                transition-colors
              "
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
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
