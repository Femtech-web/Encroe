import { json, readBody } from "@/lib/game/http";
import { isGame } from "@/lib/game/games";
import { isStudio, writeSealed, type Sealed } from "@/lib/game/server";

const HEX32 = /^[0-9a-f]{64}$/;

/** After a seal is committed on chain, the studio's bot hands the game each player's proof for that epoch. */
export async function POST(req: Request) {
  if (!isStudio(req)) return json({ error: "studio only" }, 401);
  const body = (await readBody(req)) as Sealed | null;
  if (
    !body ||
    !/^[a-z0-9._-]+\.(testnet|near)$/.test(body.escrow) ||
    !Number.isSafeInteger(body.epoch) ||
    !Number.isSafeInteger(body.sealed_at) ||
    !HEX32.test(body.root) ||
    !Array.isArray(body.players) ||
    body.players.some((p) => !HEX32.test(p.pk) || !HEX32.test(p.salt) || !HEX32.test(p.leaf))
  )
    return json(
      { error: "expected {escrow, epoch, root, sealed_at, players: [{index, pk, items, salt, leaf, path}]}" },
      400,
    );
  const game = new URL(req.url).searchParams.get("game") ?? "embergate";
  if (!isGame(game)) return json({ error: "no such game" }, 404);
  await writeSealed(body, game);
  return json({ ok: true, players: body.players.length });
}
