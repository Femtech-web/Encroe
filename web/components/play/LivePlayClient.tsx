"use client";

import dynamic from "next/dynamic";

/** The player's key lives in this browser, so a live game renders only here. */
export const LivePlayClient = dynamic(() => import("./LivePlay").then((m) => m.LivePlay), {
  ssr: false,
  loading: () => <div className="min-h-[70vh]" />,
});
