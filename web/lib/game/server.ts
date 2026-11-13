import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "./store";
import { EMPTY_WORLD, play, type Outcome, type World } from "./world";
import type { SignedMove } from "./moves";

/** The sealed core, exactly as the browser and the enclave get it. */
export const CORE_FILE = path.join(process.cwd(), "public/core/embergate.wasm");

let loaded: Promise<{ module: WebAssembly.Module; sha256: string }> | undefined;

export function core(): Promise<{ module: WebAssembly.Module; sha256: string }> {
  loaded ??= readFile(CORE_FILE).then(async (bytes) => ({
    module: await WebAssembly.compile(bytes),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
  return loaded;
}

export async function readWorld(): Promise<World> {
  return (await getStore().get<World>("world"))?.value ?? EMPTY_WORLD;
}

/** Plays a move against the stored world; a concurrent write means the move is replayed on the newer world. */
export async function act(s: SignedMove, now = Date.now()): Promise<Outcome> {
  const { module } = await core();
  const store = getStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = await store.get<World>("world");
    const out = await play(stored?.value ?? EMPTY_WORLD, s, now, module);
    if (!out.ok || (await store.put("world", out.world, stored?.rev ?? 0))) return out;
  }
  return { ok: false, status: 503, reason: "the world is busy; try again" };
}

/** One player's line in a sealed epoch, as `encore seal` writes it. */
export type ProofEntry = {
  index: number;
  pk: string;
  items: [number, number][];
  salt: string;
  leaf: string;
  path: [string, boolean][];
};

/** What the studio's bot sealed last: the escrow, the epoch and every player's proof against its root. */
export type Sealed = { escrow: string; epoch: number; root: string; sealed_at: number; players: ProofEntry[] };

export async function readSealed(): Promise<Sealed | null> {
  return (await getStore().get<Sealed>("sealed"))?.value ?? null;
}

export async function writeSealed(sealed: Sealed): Promise<void> {
  const store = getStore();
  const cur = await store.get<Sealed>("sealed");
  if (!(await store.put("sealed", sealed, cur?.rev ?? 0))) throw new Error("sealed: concurrent write");
}

/** Bearer-token check for the studio's own endpoints, constant-time over the hashes. */
export function isStudio(req: Request): boolean {
  const token = process.env.ENCROE_STUDIO_TOKEN;
  if (!token) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  return given.length > 0 && timingSafeEqual(a, b);
}
