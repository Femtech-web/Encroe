"use client";

import { useEffect } from "react";

/** Runs `fn` now and every `ms` while the tab is visible; a hidden tab asks nothing, and catches up when shown. */
export function usePoll(fn: () => unknown, ms: number): void {
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (id !== undefined) return;
      fn();
      id = setInterval(fn, ms);
    };
    const stop = () => {
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fn, ms]);
}
