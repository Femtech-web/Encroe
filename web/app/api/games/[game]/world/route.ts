import { json } from "@/lib/game/http";
import { worldView } from "@/lib/game/handlers";
import { isGame } from "@/lib/game/games";

/** A game's world, as anyone may see it. */
export async function GET(req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGame(game)) return json({ error: "no such game" }, 404);
  return worldView(game);
}
