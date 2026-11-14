import { json } from "@/lib/game/http";
import { move } from "@/lib/game/handlers";
import { isGame } from "@/lib/game/games";

/** A signed move in a game. */
export async function POST(req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGame(game)) return json({ error: "no such game" }, 404);
  return move(req, game);
}
