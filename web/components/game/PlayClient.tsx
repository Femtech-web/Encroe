"use client";

import dynamic from "next/dynamic";

/** The game reads the player's key from this browser, so it renders only here. */
export const PlayClient = dynamic(() => import("./Game").then((m) => m.Game), {
  ssr: false,
  loading: () => <div className="min-h-[70vh]" />,
});
