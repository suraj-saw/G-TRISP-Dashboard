import { useEffect, useRef, useCallback } from "react";

interface UseIdleTimerOptions {
  /** Inactivity timeout in milliseconds. Default: 30 minutes (1,800,000 ms) */
  timeoutMs?: number;
  /** Callback executed when user is determined to be idle */
  onIdle: () => void;
  /** Whether the timer is currently enabled. Default: true */
  enabled?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Custom hook to detect user inactivity across the web application.
 * Listens for mouse movements, key presses, clicks, scrolling, and touch events.
 * Executes `onIdle` when no user interactions occur for `timeoutMs`.
 */
export function useIdleTimer({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onIdle,
  enabled = true,
}: UseIdleTimerOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const onIdleRef = useRef(onIdle);

  // Keep callback ref updated to avoid stale closures in listeners
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (!enabled) return;

    timerRef.current = setTimeout(() => {
      onIdleRef.current();
    }, timeoutMs);
  }, [timeoutMs, enabled]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Debounce activity listener to avoid high-frequency handler calls
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleUserActivity = () => {
      if (throttleTimeout) return;

      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
        resetTimer();
      }, 1000); // Throttle activity updates to once per second max
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];

    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Start initial timer
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (throttleTimeout) clearTimeout(throttleTimeout);

      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [enabled, resetTimer]);
}
