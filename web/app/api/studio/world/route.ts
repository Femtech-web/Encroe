import { json } from "@/lib/game/http";
import { isGame } from "@/lib/game/games";
import { isStudio, readWorld } from "@/lib/game/server";

/** The studio's export for sealing (`?game=`, default Embergate): `[{pk, items}]`, the format `encore seal --players-file` reads. */
export async function GET(req: Request) {
  if (!isStudio(req)) return json({ error: "studio only" }, 401);
  const game = new URL(req.url).searchParams.get("game") ?? "embergate";
  if (!isGame(game)) return json({ error: "no such game" }, 404);
  const world = await readWorld(game);
  return json(world.players.map((p) => ({ pk: p.pk, items: p.items })));
}
