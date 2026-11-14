import { json } from "@/lib/game/http";
import { player } from "@/lib/game/handlers";
import { isGame } from "@/lib/game/games";

/** One player's items in a game, by key. */
export async function GET(req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGame(game)) return json({ error: "no such game" }, 404);
  return player(req, game);
}
