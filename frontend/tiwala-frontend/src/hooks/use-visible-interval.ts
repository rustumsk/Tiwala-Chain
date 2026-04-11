import { useEffect, useRef } from "react";

/**
 * Runs `callback` every `intervalMs` while `enabled`, skipping ticks when the document is hidden.
 */
export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  enabled: boolean
) {
  const cb = useRef(callback);
  cb.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      cb.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
}
