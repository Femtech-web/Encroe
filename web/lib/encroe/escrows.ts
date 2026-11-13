import { RPC, viewStatus, type EscrowStatus } from "../game/near";
import POOL from "./pool.json";

export const REPO = "https://github.com/Femtech-web/Encroe";

/** The escrows this site points at, each with the run that recorded it (docs/results/escrow/<results>). */
export const ESCROWS: { id: string; results: string; story: string }[] = [
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
    sha256: "7c5c8e3f05cc624bc154d7b6f17f4364c05068398038ee14ec0f201ed69458fe",
    escrow: "encroe-matchday-b565.testnet",
  },
  {
    game: "Neon City",
    language: "C",
    toolchain: "clang (Zig 0.17) → wasm32",
    genre: "an open-world city economy, the GTA Online genre: jobs, vehicles, heists, property",
    source: "cores/neon-city/neon_city.c",
    sha256: "165e920322f1307799696a4b682763a01d500b08763a0e997357da1e9d51f891",
    escrow: "NEON_ESCROW",
  },
];
