// frontend/src/components/layout/FilterSelect.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

export default function FilterSelect({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  // Position the menu from the trigger's on-screen rect (escapes overflow clipping)
  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuMaxHeight = 256;
    const spaceBelow = window.innerHeight - rect.bottom;
    // Flip above the trigger if there isn't enough room below
    const openUp = spaceBelow < menuMaxHeight && rect.top > spaceBelow;

    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
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
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[#9BA3C2] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* MENU (portal — fixed, escapes the sidebar's overflow clipping) */}
      {open &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: 256,
              zIndex: 9999,
            }}
            className="overflow-y-auto no-scrollbar rounded-xl border border-[#E4E8F4] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                      isSelected
                        ? "bg-[#1e3a8a] font-semibold text-white"
                        : "font-medium text-[#3A4060] hover:bg-[#EEF2FB] hover:text-[#1e3a8a]"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <Check size={14} className="shrink-0" />}
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
