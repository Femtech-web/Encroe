import { json } from "@/lib/game/http";
import { isStudio, readWorld } from "@/lib/game/server";

/** The studio's export for sealing: `[{pk, items}]`, the format `encore seal --players-file` reads. */
export async function GET(req: Request) {
  if (!isStudio(req)) return json({ error: "studio only" }, 401);
  const world = await readWorld();
  return json(world.players.map((p) => ({ pk: p.pk, items: p.items })));
}
