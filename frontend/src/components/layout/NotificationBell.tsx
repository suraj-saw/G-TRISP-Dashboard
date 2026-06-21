import { Bell } from "lucide-react";

interface Props {
  count?: number;
}

export default function NotificationBell({ count = 0 }: Props) {
  return (
    <button
      className="
      relative
      rounded-full
      p-2
      hover:bg-blue-50
      transition
      "
    >
      <Bell size={22} className="text-blue-900" />

      {count > 0 && (
        <span
          className="
          absolute
          -top-1
          -right-1
          h-5
          w-5
          rounded-full
          bg-amber-500
          text-white
          text-xs
          flex
          items-center
          justify-center
          "
        >
          {count}
        </span>
      )}
    </button>
  );
}
