import { proof } from "@/lib/game/handlers";

/** An Embergate player's own inclusion proof, for a request signed by their key. */
export async function POST(req: Request) {
  return proof(req, "embergate");
}
