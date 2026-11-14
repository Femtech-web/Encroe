import { log, reports, sweep } from "@/lib/encroe/agent";
import { json, overLimit } from "@/lib/game/http";

/**
 * The preservation agent's endpoint. POST runs one sweep: anyone may trigger it, because it only does what anyone
 * may do (release a silent escrow, check a released one). A schedule calls it too (.github/workflows/preserve.yml).
 * GET returns its log and its revival reports.
 */
export const maxDuration = 60;

export async function GET() {
  const [actions, revived] = await Promise.all([log(), reports()]);
  return json({ actions, revived });
}

export async function POST(req: Request) {
  if (await overLimit(req, "agent", 6, 3600))
    return json({ error: "the agent swept for you recently; try later" }, 429);
  try {
    return json({ actions: await sweep() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message.slice(0, 200) : "sweep failed" }, 502);
  }
}
