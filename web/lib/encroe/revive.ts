import { RPC } from "../game/near";
import { merkleRoot, playerLeaf } from "../game/proof";
import {
  appId,
  bytesToHex,
  hexToBytes,
  nearBls,
  openKey,
  openPackage,
  releaseValid,
  sha256Hex,
  type Package,
} from "./release";

/** What an escrow's `get_state` says, as far as reviving the game needs. */
export type EscrowState = {
  owner: string;
  path: string;
  key_mode: string;
  released: { big_y: string; big_c: string } | null;
  released_by: string | null;
  released_at_ns: string | null;
  release_condition_met: boolean;
  last_heartbeat_ns: string;
  grace_ns: string;
  commitment: {
    game: string;
    epoch: number;
    ckd_pk: string;
    app_id: string;
    sealed_u: string;
    sealed_v: string;
    pkg_sha256: string;
    root: string;
    core_sha256: string;
    players: number;
  } | null;
};

export type Step = { id: string; label: string; ok?: boolean; detail?: string };

export type Revived = {
  escrow: string;
  state: EscrowState;
  pkg: Package;
  core: Uint8Array;
  module: WebAssembly.Module;
};

/** Where the studio put the sealed package: on NEAR itself, through FastFS. Its hash, not its host, is what counts. */
export function packageUrl(owner: string, escrow: string, pkgSha256: string): string {
  return `https://test.fastfs.io/${owner}/${escrow}/${pkgSha256}.sealed`;
}

export async function viewState(escrow: string, rpc = RPC): Promise<EscrowState> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: escrow,
        method_name: "get_state",
        args_base64: "e30=",
      },
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: { result: number[] }; error?: { message?: string } };
  if (!body.result) throw new Error(`${escrow}: ${body.error?.message ?? `HTTP ${res.status}`}`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as EscrowState;
}

export type Sources = {
  state(escrow: string): Promise<EscrowState>;
  sealed(url: string): Promise<Uint8Array>;
};

export const LIVE: Sources = {
  state: (escrow) => viewState(escrow),
  sealed: async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} from FastFS`);
    return new Uint8Array(await res.arrayBuffer());
  },
};

class Failed extends Error {}

/** The escrow holds: its studio is alive, or silent but nobody has released it yet. */
export class NotReleased extends Error {
  constructor(
    readonly conditionMet: boolean,
    /** When the heartbeat lapses (ms since the epoch). */
    readonly lapsesAt: number,
  ) {
    super(
      conditionMet
        ? "The studio is silent: anyone may release this escrow now."
        : `Not released: the studio's heartbeat holds until ${new Date(lapsesAt).toUTCString()}.`,
    );
  }
}

/**
 * Brings a released game back from public data only: the escrow's state on NEAR, the package on FastFS. Each
 * check is reported as it passes; the first that fails stops everything.
 */
export async function revive(escrow: string, report: (s: Step) => void, from: Sources = LIVE): Promise<Revived> {
  const fail = (id: string, label: string, detail: string) => {
    report({ id, label, ok: false, detail });
    return new Failed(`${label}: ${detail}`);
  };
  const step = (id: string, label: string, ok: boolean, detail: string) => {
    if (!ok) throw fail(id, label, detail);
    report({ id, label, ok, detail });
  };

  const state = await from.state(escrow);
  const c = state.commitment;
  if (!c) throw new Failed("nothing was ever sealed in this escrow");
  if (!state.released) {
    const lapse = (BigInt(state.last_heartbeat_ns) + BigInt(state.grace_ns)) / 1_000_000n;
    throw new NotReleased(state.release_condition_met, Number(lapse));
  }
  step("chain", "Read the escrow from NEAR", true, `${c.game}, epoch ${c.epoch}, released by ${state.released_by}`);

  if (state.key_mode !== "pv_identity") throw new Failed(`key mode ${state.key_mode} is not supported here`);
  const pk = nearBls(c.ckd_pk, "bls12381g2");
  const app = hexToBytes(c.app_id);
  const sig = nearBls(state.released.big_c, "bls12381g1");
  step(
    "identity",
    "The key belongs to this contract",
    bytesToHex(appId(escrow, state.path)) === c.app_id,
    `app id ${c.app_id.slice(0, 16)}…`,
  );
  step(
    "release",
    "NEAR's MPC network signed the release",
    releaseValid(pk, app, sig),
    "e(sig, g2) = e(H(pk‖app id), pk)",
  );

  const url = packageUrl(state.owner, escrow, c.pkg_sha256);
  const sealed = await from.sealed(url);
  step(
    "package",
    "The sealed package is the one committed",
    sha256Hex(sealed) === c.pkg_sha256,
    `${sealed.length} bytes from FastFS, sha256 ${c.pkg_sha256.slice(0, 16)}…`,
  );

  const k = openKey(pk, app, sig, hexToBytes(c.sealed_u), hexToBytes(c.sealed_v));
  let pkg: Package;
  try {
    pkg = JSON.parse(new TextDecoder().decode(await openPackage(k, sealed, c.game, c.epoch))) as Package;
  } catch {
    throw fail("open", "Decrypt it with the released key", "the key does not open this package");
  }
  step(
    "open",
    "Decrypt it with the released key",
    pkg.game === c.game && pkg.epoch === c.epoch,
    `AES-256-GCM, ${pkg.players.length} players inside`,
  );

  const core = Uint8Array.from(atob(pkg.core_wasm_b64), (ch) => ch.charCodeAt(0));
  step(
    "core",
    "The server core is the build the enclave verified",
    sha256Hex(core) === c.core_sha256,
    `sha256 ${c.core_sha256.slice(0, 16)}…`,
  );

  const root = merkleRoot(pkg.players.map((p) => playerLeaf(c.game, c.epoch, p.pk, p.items, p.salt)));
  step(
    "players",
    "Every player's items match NEAR's root",
    root === c.root && pkg.players.length === c.players,
    `${pkg.players.length} leaves → ${root.slice(0, 16)}…`,
  );

  const compiled = await WebAssembly.compile(core as BufferSource);
  const imports = WebAssembly.Module.imports(compiled).length;
  step(
    "boot",
    "The server boots in this browser",
    imports === 0,
    `${WebAssembly.Module.exports(compiled).length} exports, ${imports} imports`,
  );
  return { escrow, state, pkg, core, module: compiled };
}
