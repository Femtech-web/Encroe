"use client";

import { useEffect, useState } from "react";
import type { Catalog, CoreMove } from "@/lib/cores/catalog";
import { loadKey, saveKey } from "@/lib/game/client";
import { GAME_IDS, GAMES } from "@/lib/game/games";
import { newSecretKey } from "@/lib/game/moves";
import { localDriver, type Driver } from "@/lib/play/drivers";
import type { PackagePlayer } from "@/lib/encroe/release";
import { CoreGame } from "./CoreGame";

/** A released game, brought back and played in this browser: the same screen, the core from the escrow. */
export function RevivedPlay(props: {
  module: WebAssembly.Module;
  players: PackagePlayer[];
  catalog: Catalog & { moves: CoreMove[] };
  escrow: string;
}) {
  const { module, players, catalog, escrow } = props;
  const [sk] = useState(() => {
    const key = loadKey() ?? newSecretKey();
    saveKey(key);
    return key;
  });
  const [driver, setDriver] = useState<Driver | null>(null);
  const game = GAME_IDS.find((g) => GAMES[g].name === catalog.game);
  useEffect(() => {
    localDriver(game, module, players, sk).then(setDriver);
  }, [game, module, players, sk]);
  if (!driver) return <div className="min-h-[60vh]" />;
  return (
    <CoreGame
      game={game}
      catalog={catalog}
      driver={driver}
      sk={sk}
      live={false}
      banner={
        <>
          {catalog.game}, revived from <span className="font-mono">{escrow}</span>: its {catalog.language} server core
          runs in your browser. No studio server is involved.
        </>
      }
    />
  );
}
