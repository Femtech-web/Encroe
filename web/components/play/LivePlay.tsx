"use client";

import { useMemo } from "react";
import { CATALOGS } from "@/lib/cores/catalog";
import { loadKey, saveKey } from "@/lib/game/client";
import { GAMES, type GameId } from "@/lib/game/games";
import { newSecretKey } from "@/lib/game/moves";
import { serverDriver } from "@/lib/play/drivers";
import { CoreGame } from "./CoreGame";

/** A game's live world, hosted by the studio: this browser's key signs every move; the sealed core decides it. */
export function LivePlay({ game }: { game: GameId }) {
  const info = GAMES[game];
  const catalog = CATALOGS[info.sha256];
  const sk = useMemo(() => {
    const key = loadKey() ?? newSecretKey();
    saveKey(key);
    return key;
  }, []);
  const driver = useMemo(() => serverDriver(game, sk), [game, sk]);
  if (!catalog?.moves) return null;
  return (
    <CoreGame
      game={game}
      catalog={{ ...catalog, moves: catalog.moves }}
      driver={driver}
      sk={sk}
      live
      banner={
        <>
          Live. Every rule runs in {info.name}&rsquo;s sealed {info.language} core (sha256 {info.sha256.slice(0, 12)}…);
          your browser&rsquo;s key signs every move.{" "}
          {info.escrow ? `Sealed into ${info.escrow}.` : "Its world is not sealed into an escrow yet."}
        </>
      }
    />
  );
}
