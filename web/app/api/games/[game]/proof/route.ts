import { json } from "@/lib/game/http";
import { proof } from "@/lib/game/handlers";
import { isGame } from "@/lib/game/games";

/** A player's own inclusion proof in a game, for a request signed by their key. */
export async function POST(req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGame(game)) return json({ error: "no such game" }, 404);
  return proof(req, game);
}
