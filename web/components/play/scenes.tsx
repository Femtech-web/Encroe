import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Items } from "@/lib/game/items";
import type { Standing } from "@/lib/play/drivers";

/** What a game's own scene gets from the game screen: it shows the world and may send the game's moves. */
export type SceneProps = {
  me: { name: string; items: Items } | null;
  pk: string;
  board: Standing[];
  events: string[];
  players: number;
  /** The player's last move and what the core said, numbered so each is shown once. */
  last: { move: string; args: number[]; ok: boolean; text: string; n: number } | null;
  act: (move: string, args: number[]) => void;
  busy: boolean;
  live: boolean;
};

/** Games with a scene of their own, by name; the others play from the panel alone. WebGL runs in the browser only. */
export const SCENES: Record<string, ComponentType<SceneProps>> = {
  Starhaul: dynamic(() => import("./StarhaulScene").then((m) => m.StarhaulScene), {
    ssr: false,
    loading: () => <div className="h-[380px] rounded-xl border border-line bg-void sm:h-[460px] lg:h-[540px]" />,
  }),
};
