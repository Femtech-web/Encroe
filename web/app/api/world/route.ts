import { json } from "@/lib/game/http";
import { core, readSealed, readWorld } from "@/lib/game/server";
import { view } from "@/lib/game/transport";
import { totals } from "@/lib/game/world";

/** The world anyone can see: who is here, what happened lately, what NEAR holds sealed. No one's items. */
export async function GET() {
  const [world, sealed, { sha256 }] = await Promise.all([readWorld(), readSealed(), core()]);
  return json({
    ...view(world, sha256),
    totals: totals(world),
    sealed: sealed && {
      escrow: sealed.escrow,
      epoch: sealed.epoch,
      root: sealed.root,
      sealed_at: sealed.sealed_at,
      players: sealed.players.length,
    },
  });
}
