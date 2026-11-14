import { player } from "@/lib/game/handlers";

/** One Embergate player's items, by key. */
export async function GET(req: Request) {
  return player(req, "embergate");
}
