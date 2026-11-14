"use client";

import dynamic from "next/dynamic";

/** The wallet runs in the browser only. */
export const StudioConsoleClient = dynamic(() => import("./StudioConsole").then((m) => m.StudioConsole), {
  ssr: false,
  loading: () => <div className="min-h-48 rounded-xl border border-line bg-panel" />,
});
