import { RPC, viewStatus, type EscrowStatus } from "../game/near";
import { base58Decode, bytesToHex } from "./release";
import POOL from "./pool.json";

export const REPO = "https://github.com/Femtech-web/Encroe";

/** The escrows this site points at, each with the run that recorded it (docs/results/escrow/<results>). */
export const ESCROWS: { id: string; results: string; story: string }[] = [
  {
    id: "encroe-embergate.testnet",
    results: "embergate",
    story: "This site's public world: the studio's bot seals it, the enclave verifies it, players check their items",
  },
  {
    id: "encroe-ember-3924.testnet",
    results: "ember-3924",
    story: "Embergate's played world: sealed, verified green, checked by its own players",
  },
  {
    id: "encroe-kill-beaa.testnet",
    results: "kill-beaa",
    story: "Killed from this site: a visitor's click released it, the browser brought it back",
  },
  {
    id: "encroe-kill-827e.testnet",
    results: "kill-827e",
    story: "A silent studio: released by a stranger, revived and played on in a browser",
  },
  {
    id: "encroe-life-52e4.testnet",
    results: "life-52e4",
    story: "The first full life: a broken build caught red, the real one green, the studio's silence, the release",
  },
];

export async function accessKeys(account: string): Promise<number | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "query",
        params: { request_type: "view_access_key_list", finality: "final", account_id: account },
      }),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: { keys: unknown[] } };
    return body.result ? body.result.keys.length : null;
  } catch {
    return null;
  }
}

export type Live = { id: string; results: string; story: string; status: EscrowStatus | null; keys: number | null };

/** Each escrow as NEAR reports it right now; a failed read shows as unknown, never as a made-up state. */
export async function liveEscrows(): Promise<Live[]> {
  return Promise.all(
    ESCROWS.map(async (e) => {
      const [status, keys] = await Promise.all([viewStatus(e.id).catch(() => null), accessKeys(e.id)]);
      return { ...e, status, keys };
    }),
  );
}

/** A silent studio nobody has released yet, for a visitor to kill; or the latest one already released. */
export async function killTarget(): Promise<{ escrow: string; fresh: boolean } | null> {
  const pool = [...POOL].reverse();
  const states = await Promise.all(pool.map((id) => viewStatus(id).catch(() => null)));
  const i = states.findIndex((s) => s && s.phase !== "released" && s.phase !== "releasing");
  if (i >= 0) return { escrow: pool[i], fresh: true };
  return pool.length ? { escrow: pool[0], fresh: false } : null;
}

/** The same escrow, three languages: each game's core sealed, verified by the enclave, released and revived. */
export const CORE_RUNS: {
  game: string;
  language: string;
  toolchain: string;
  genre: string;
  source: string;
  sha256: string;
  escrow: string;
}[] = [
  {
    game: "Embergate",
    language: "Rust",
    toolchain: "rustc → wasm32",
    genre: "a crafting world: six nodes, forged relics, the Phoenix",
    source: "crates/embergate-core/src/lib.rs",
    sha256: "49ff0c57f10f24b9091eae3bd218b28a642d581f698871f6b3c65b7effa9cb62",
    escrow: "encroe-kill-827e.testnet",
  },
  {
    game: "Matchday",
    language: "C++",
    toolchain: "clang (Zig 0.17) → wasm32",
    genre: "a football card club, the Ultimate Team genre: packs, rated cards, matches, a transfer market",
    source: "cores/matchday/matchday.cpp",
    sha256: "f149751774f754b956636225c79d294494e1b5dc2c523867eeb2d5b3f96dba4a",
    escrow: "encroe-matchday-5d60.testnet",
  },
  {
    game: "Neon City",
    language: "C",
    toolchain: "clang (Zig 0.17) → wasm32",
    genre: "an open-world city economy, the GTA Online genre: jobs, vehicles, heists, property",
    source: "cores/neon-city/neon_city.c",
    sha256: "3f4a1e626aa6fc2e819aaaf5e3ee718e0e6307de87d47c895a93addb336bb3d2",
    escrow: "encroe-neon-city-19f9.testnet",
  },
];

/** The build every Encroe escrow runs (contracts/encroe-escrow, docs/results/escrow/*\/code-sha256.txt). */
export const ESCROW_CODE_SHA256 = "08d9174fedb6374971b076591d915423d2fab6bc7f5bb056be308178b3901fbf";

/** SHA-256 of the code an account runs, as NEAR reports it; null if it runs none or the read failed. */
export async function codeSha256(account: string): Promise<string | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "query",
        params: { request_type: "view_code", finality: "final", account_id: account },
      }),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: { hash: string } };
    return body.result ? bytesToHex(base58Decode(body.result.hash)) : null;
  } catch {
    return null;
  }
}

/** True for the escrows this site may act on: ours (encroe-*) and the factory's (<name>.encroe.testnet). */
export function isEscrowId(id: unknown): id is string {
  return typeof id === "string" && /^(encroe-[a-z0-9-]{1,40}|[a-z0-9-]{2,32}\.encroe)\.testnet$/.test(id);
}
