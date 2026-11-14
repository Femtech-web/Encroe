import { worldView } from "@/lib/game/handlers";

/** Embergate's world (the first game; every game's is at /api/games/[game]/world). */
export async function GET() {
  return worldView("embergate");
}
