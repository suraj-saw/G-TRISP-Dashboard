import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0
        z-[9999]
        flex items-center justify-center
        bg-slate-900/35
        backdrop-blur-[2px]
        p-4
      "
    >
      <div
        className="
          w-full max-w-[380px]
          rounded-[20px]
          bg-white
          border border-slate-200
          shadow-[0_18px_60px_rgba(15,23,42,0.20)]
          overflow-hidden
          animate-in fade-in zoom-in-95 duration-200
        "
      >
        <div className="px-6 pt-6 pb-5">
          {/* Icon */}
          <div className="flex justify-center">
            <div
              className="
                h-13 w-13
                rounded-full
                bg-red-50
                flex items-center justify-center
              "
            >
              <AlertTriangle
                size={24}
                className="text-red-600"
                strokeWidth={2.2}
              />
            </div>
          </div>

          {/* Title */}
          <h2 className="mt-5 text-center text-xl font-bold text-slate-900">
            {title}
          </h2>

          {/* Message */}
          <p className="mt-2 text-center text-sm leading-6 text-slate-500">
            {message}
          </p>

          {/* Buttons */}
          <div className="mt-7 flex justify-center gap-3">
            <button
              onClick={onCancel}
              className="
                min-w-[110px]
                rounded-xl
                border border-slate-300
                bg-white
                px-5 py-2.5
                text-sm font-semibold
                text-slate-700
                transition-all
                hover:bg-slate-100
                hover:border-slate-400
                active:scale-[0.98]
              "
            >
              {cancelText}
            </button>

            <button
              onClick={onConfirm}
              className={`
                min-w-[130px]
                rounded-xl
                px-5 py-2.5
                text-sm font-semibold
                text-white
                transition-all
                active:scale-[0.98]

                ${
                  danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#1e3a8a] hover:bg-[#17337b]"
                }
              `}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
