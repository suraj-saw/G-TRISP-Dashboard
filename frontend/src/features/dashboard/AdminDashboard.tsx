/**
 * @file AdminDashboard.tsx
 * @description Entry point for the Admin Dashboard.
 * @responsibility Simply wraps the `GujaratOverview` component but enables admin-specific controls and views.
 */
import GujaratOverview from "./GujaratOverview";

/**
 * AdminDashboard Component
 * @returns {JSX.Element} The rendered Gujarat Overview with admin features enabled.
 */
export default function AdminDashboard() {
  return <GujaratOverview allowAdmin showAdminControls />;
}
