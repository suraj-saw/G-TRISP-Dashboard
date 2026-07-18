import { AlertTriangle } from "lucide-react";

/**
 * Props for the ConfirmDialog component.
 * @interface ConfirmDialogProps
 * @property {boolean} open - Controls the visibility of the dialog.
 * @property {string} title - The main heading text for the dialog.
 * @property {string} message - The descriptive body text.
 * @property {string} [confirmText="Confirm"] - Text for the primary action button.
 * @property {string} [cancelText="Cancel"] - Text for the secondary/cancel button.
 * @property {() => void} onConfirm - Callback fired when the confirm button is clicked.
 * @property {() => void} onCancel - Callback fired when the cancel button or background is clicked.
 * @property {boolean} [danger=false] - If true, styles the confirm button with a destructive (red) theme.
 */
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

/**
 * ConfirmDialog Component
 * A reusable modal dialog for confirming user actions (e.g., sign out, delete).
 */
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
  // Do not render anything if the dialog is not open
  if (!open) return null;

  return (
    /* 
      OVERLAY CONTAINER
      'fixed inset-0' ensures it takes up the entire viewport height/width.
      'flex items-center justify-center' strictly centers the modal box horizontally and vertically. 
    */
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
      {/* DIALOG BOX */}
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
          {/* Header Icon */}
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

          {/* Dialog Title */}
          <h2 className="mt-5 text-center text-xl font-bold text-slate-900">
            {title}
          </h2>

          {/* Dialog Message */}
          <p className="mt-2 text-center text-sm leading-6 text-slate-500">
            {message}
          </p>

          {/* Action Buttons */}
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
