"use client";

import dynamic from "next/dynamic";

/** Reviving reads this browser's key and runs the core here, so it renders only here. */
export const ReviveClient = dynamic(() => import("./Revive").then((m) => m.Revive), {
  ssr: false,
  loading: () => <div className="min-h-[70vh]" />,
});
