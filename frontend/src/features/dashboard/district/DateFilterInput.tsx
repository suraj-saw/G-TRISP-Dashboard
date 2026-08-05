// frontend/src/features/dashboard/district/DateFilterInput.tsx

import { useState, useEffect } from "react";

type DateBounds = {
  min?: string;
  max?: string;
};

const clampDateValue = (value: string, bounds: DateBounds): string => {
  if (!value) return "";
  if (bounds.min && value < bounds.min) return bounds.min;
  if (bounds.max && value > bounds.max) return bounds.max;
  return value;
};

export function DateFilterInput({
  value,
  min,
  max,
  onCommit,
  className,
}: {
  value: string;
  min?: string;
  max?: string;
  onCommit: (value: string) => void;
  className: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = clampDateValue(draft, { min, max });
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="date"
      value={draft}
      min={min}
      max={max}
      onChange={(event) => {
        const next = clampDateValue(event.target.value, { min, max });
        setDraft(next);
        if (next !== value) onCommit(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}
