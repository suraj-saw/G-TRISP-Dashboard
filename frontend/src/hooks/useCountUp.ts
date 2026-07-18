/**
 * @file useCountUp.ts
 * @description Provides a custom React hook to smoothly animate a numerical value from its previous state to a new target state over a specified duration.
 * @responsibility Enhances UI transitions (e.g., in KPI cards) by preventing sudden numerical jumps when data refreshes.
 */
import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from its previous value to a `target` value over `duration` milliseconds using a cubic easing function.
 * 
 * @hooks_usage Uses `useState` to trigger re-renders with the interpolated value, `useRef` to maintain the previous target and requestAnimationFrame ID, and `useEffect` to manage the animation lifecycle.
 * @param {number} target - The final numerical value to animate towards.
 * @param {number} [duration=250] - The duration of the animation in milliseconds.
 * @returns {number} The current interpolated value during the animation, or the target value when complete.
 */
export function useCountUp(target: number, duration = 250): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    
    /**
     * The animation loop callback.
     * Calculates the elapsed time fraction `t`, applies an ease-out cubic function (`eased`),
     * and interpolates between the `from` and `to` values.
     * 
     * @param {number} now - The high-resolution timestamp provided by requestAnimationFrame.
     */
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic: starts fast, slows down towards the end.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
