"use client";

import dynamic from "next/dynamic";

/** The wallet runs in the browser only. */
export const CreateEscrowClient = dynamic(() => import("./CreateEscrow").then((m) => m.CreateEscrow), {
  ssr: false,
  loading: () => <div className="min-h-96 rounded-xl border border-line bg-panel" />,
});
