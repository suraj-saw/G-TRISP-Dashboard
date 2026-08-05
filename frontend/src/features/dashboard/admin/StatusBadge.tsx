// frontend/src/features/dashboard/admin/StatusBadge.tsx

import type { ReactNode } from "react";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import type { User } from "../../../types/user";

export function StatusBadge({ status }: { status: User["status"] }) {
  const styles: Record<User["status"], string> = {
    approved: "bg-emerald-100/80 text-emerald-700 border-emerald-200/50",
    rejected: "bg-rose-100/80 text-rose-700 border-rose-200/50",
    pending: "bg-amber-100/80 text-amber-700 border-amber-200/50",
  };

  const icons: Record<User["status"], ReactNode> = {
    approved: <CheckCircle className="w-3 h-3 mr-1" />,
    rejected: <XCircle className="w-3 h-3 mr-1" />,
    pending: <Clock className="w-3 h-3 mr-1" />,
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize border ${styles[status]}`}
    >
      {icons[status]}
      {status}
    </span>
  );
}
