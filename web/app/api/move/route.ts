import { move } from "@/lib/game/handlers";

/** A signed Embergate move. */
export async function POST(req: Request) {
  return move(req, "embergate");
}
