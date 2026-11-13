import { createHash } from "node:crypto";
import { getStore } from "./store";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Counts this request against its client's budget; true when over it. The address is stored only hashed. */
export async function overLimit(req: Request, bucket: string, max: number, windowS: number): Promise<boolean> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const id = createHash("sha256").update(`${bucket}|${ip}`).digest("hex").slice(0, 24);
  return (await getStore().hit(`limit:${bucket}:${id}`, windowS)) > max;
}

export async function readBody(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > 64_000) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}
