"use client";

import dynamic from "next/dynamic";

/** The wallet and the sealing run in the browser only. */
export const SealEpochClient = dynamic(() => import("./SealEpoch").then((m) => m.SealEpoch), {
  ssr: false,
  loading: () => <div className="min-h-[40rem] rounded-xl border border-line bg-panel" />,
});
