// frontend/src/components/layout/FilterSelect.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string | string[];
  options: Option[];
  onChange: (value: string | string[]) => void;
  multiSelect?: boolean;
}

// Max height the menu would like, and the breathing room we keep from the
// viewport edges so the last option is never flush against the screen/taskbar.
const MENU_MAX_HEIGHT = 256;
const VIEWPORT_MARGIN = 12;
const TRIGGER_GAP = 6;

type MenuPos =
  | {
      openUp: false;
      top: number;
      left: number;
      width: number;
      maxHeight: number;
    }
  | {
      openUp: true;
      bottom: number;
      left: number;
      width: number;
      maxHeight: number;
    };

export default function FilterSelect({
  value,
  options,
  onChange,
  multiSelect = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const isMulti = multiSelect && Array.isArray(value);

  let displayText = "";
  if (!isMulti) {
    const selected = options.find((o) => o.value === value) ?? options[0];
    displayText = selected?.label || "Select";
  } else {
    const arr = value as string[];
    if (arr.length === 0) {
      displayText = "All Selected";
    } else if (arr.length === 1) {
      const selected = options.find((o) => o.value === arr[0]);
      displayText = selected?.label || arr[0];
    } else {
      displayText = `${arr.length} Selected`;
    }
  }

  // Position the menu from the trigger's on-screen rect (escapes overflow clipping).
  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;

    // Flip up only when below is too cramped AND above has more room.
    const openUp = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow;

    // Clamp the menu height to whatever space is actually available on that side
    // so its content scrolls internally instead of overflowing the viewport.
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(
      96,
      Math.min(MENU_MAX_HEIGHT, available - TRIGGER_GAP)
    );

    if (openUp) {
      setPos({
        openUp: true,
        // Anchor the menu's BOTTOM just above the trigger so it grows upward.
        bottom: window.innerHeight - rect.top + TRIGGER_GAP,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    } else {
      setPos({
        openUp: false,
        top: rect.bottom + TRIGGER_GAP,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const reposition = () => updatePosition();

    document.addEventListener("mousedown", handlePointer);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const handleOptionClick = (optionValue: string) => {
    if (isMulti) {
      const arr = value as string[];
      if (arr.includes(optionValue)) {
        onChange(arr.filter((v) => v !== optionValue));
      } else {
        onChange([...arr, optionValue]);
      }
    } else {
      onChange(optionValue);
      setOpen(false);
    }
  };

  return (
    <>
      {/* TRIGGER */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium text-[#1A1D2E] outline-none transition cursor-pointer ${
          open
            ? "border-[#1e3a8a] ring-2 ring-[#1e3a8a]/10 bg-white"
            : "border-[#E4E8F4] bg-[#F7F9FD] hover:border-[#C9CEDF]"
        }`}
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[#9BA3C2] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* MENU (portal — fixed, escapes the sidebar's overflow clipping) */}
      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 9999,
              ...(pos.openUp ? { bottom: pos.bottom } : { top: pos.top }),
            }}
            className="overflow-y-auto no-scrollbar rounded-xl border border-[#E4E8F4] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
          >
            {options.map((option) => {
              const isSelected = isMulti
                ? (value as string[]).includes(option.value)
                : option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => handleOptionClick(option.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                      isSelected && !isMulti
                        ? "bg-[#1e3a8a] font-semibold text-white"
                        : "font-medium text-[#3A4060] hover:bg-[#EEF2FB] hover:text-[#1e3a8a]"
                    }`}
                  >
                    {isMulti && (
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-[#1e3a8a] bg-[#1e3a8a] text-white"
                            : "border-[#C9CEDF] bg-white text-transparent"
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                    <span className="truncate">{option.label}</span>
                    {!isMulti && isSelected && (
                      <Check size={14} className="ml-auto shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </>
  );
}
