import { functionCall } from "@/lib/chain/tx";
import { check, log, reports } from "@/lib/encroe/agent";
import { clock, directory, row, view } from "@/lib/encroe/directory";
import { ESCROW_CODE_SHA256, accessKeys, codeSha256, isEscrowId } from "@/lib/encroe/escrows";
import { revive } from "@/lib/encroe/revive";
import { CATALOGS } from "@/lib/cores/catalog";
import { viewStatus } from "@/lib/game/near";

/**
 * Encroe over MCP, hosted (Streamable HTTP, one JSON-RPC message per POST, JSON responses; Klear's server shape).
 * Any agent can watch every game escrow, check one is real, release a silent studio's game, bring a released game
 * back with the same eight checks a browser runs, and find a player's items in it.
 * `claude mcp add --transport http encroe https://encroe.vercel.app/api/mcp`
 */

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

type Json = Record<string, unknown>;
interface Tool {
  description: string;
  input: Json;
  readOnly: boolean;
  run: (args: Json) => Promise<unknown>;
}

const escrowArg = {
  type: "object",
  properties: { escrow: { type: "string", description: "an escrow account, e.g. encroe-embergate.testnet" } },
  required: ["escrow"],
};

function escrowOf(args: Json): string {
  if (!isEscrowId(args.escrow))
    throw new Error("escrow must be an Encroe escrow account (encroe-*.testnet or *.encroe.testnet)");
  return args.escrow;
}

const TOOLS: Record<string, Tool> = {
  list_escrows: {
    description:
      "Every game escrow this site knows (the factory's directory, the public world, recorded runs, the silent studios left for visitors): the game, the language its server is written in, whether its studio is alive, silent or released, and its verification badge.",
    input: { type: "object", properties: {} },
    readOnly: true,
    async run() {
      return (await directory()).map((r) => ({
        escrow: r.id,
        game: r.catalog?.game ?? r.listing?.game ?? r.state?.commitment?.game ?? null,
        language: r.catalog?.language ?? null,
        phase: r.status?.phase ?? null,
        badge: r.status?.badge ?? null,
        heartbeat: r.status ? clock(r.status).text : null,
        epoch: r.state?.commitment?.epoch ?? null,
        players: r.state?.commitment?.players ?? null,
      }));
    },
  },
  inspect_escrow: {
    description:
      "The checks to run before trusting an escrow, read live from NEAR: no access keys, the published escrow code, who the studio is, its grace period, what is sealed (epoch, players' root, server core) and every enclave verification run.",
    input: escrowArg,
    readOnly: true,
    async run(args) {
      const escrow = escrowOf(args);
      const [r, keys, code, runs] = await Promise.all([
        row(escrow, "ours"),
        accessKeys(escrow),
        codeSha256(escrow),
        view<Json[]>(escrow, "get_runs"),
      ]);
      if (!r.state || !r.status) throw new Error(`${escrow}: not an Encroe escrow, or NEAR could not be read`);
      const c = r.state.commitment;
      return {
        escrow,
        locked: keys === 0,
        access_keys: keys,
        runs_published_escrow_code: code === ESCROW_CODE_SHA256,
        code_sha256: code,
        studio: r.state.owner,
        phase: r.status.phase,
        badge: r.status.badge,
        heartbeat: clock(r.status).text,
        release_condition_met: r.status.release_condition_met,
        released_by: r.status.released_by,
        sealed: c && {
          game: r.catalog?.game ?? c.game,
          language: r.catalog?.language ?? null,
          epoch: c.epoch,
          players: c.players,
          root: c.root,
          core_sha256: c.core_sha256,
          pkg_sha256: c.pkg_sha256,
        },
        runs: (runs ?? []).map((x) => ({ epoch: x.epoch, output_ok: x.output_ok, tcb: x.t1, accepted: x.accepted })),
      };
    },
  },
  release_escrow: {
    description:
      "Release a silent studio's escrow: its contract asks NEAR's MPC network to publish the game's key. Allowed for anyone, but only once the studio's heartbeat has lapsed past its grace period; the contract refuses otherwise. The site pays the gas. After about a minute, use bring_back.",
    input: escrowArg,
    readOnly: false,
    async run(args) {
      const escrow = escrowOf(args);
      const s = await viewStatus(escrow);
      if (s.phase === "released") return { escrow, released: true, by: s.released_by };
      if (!s.release_condition_met) return { escrow, released: false, why: clock(s).text };
      const account = process.env.ENCROE_RELAYER_ACCOUNT;
      const secret = process.env.ENCROE_RELAYER_KEY;
      if (!account || !secret) throw new Error("releasing is not configured on this deployment");
      const { hash } = await functionCall(account, secret, escrow, "release", {}, 100);
      return {
        escrow,
        sent: true,
        tx: hash,
        next: "NEAR's MPC network publishes the key in about a minute; then call bring_back",
      };
    },
  },
  bring_back: {
    description:
      "Bring a released game back from public data only: read the release from NEAR, check NEAR's MPC network signed it for this contract, fetch the sealed package from FastFS, check its hash, decrypt it, check the server core is the build the enclave verified and every player's items match the committed root, and boot the core. Returns every check and the revived world's size.",
    input: escrowArg,
    readOnly: true,
    async run(args) {
      return check(escrowOf(args));
    },
  },
  find_my_items: {
    description:
      "In a released game, the items held by one player's key (32 bytes, hex), exactly as sealed: the world is public once released. Returns item names when the game's core is known.",
    input: {
      type: "object",
      properties: {
        escrow: escrowArg.properties.escrow,
        public_key: { type: "string", description: "the player's ed25519 public key, 64 hex characters" },
      },
      required: ["escrow", "public_key"],
    },
    readOnly: true,
    async run(args) {
      const escrow = escrowOf(args);
      const pk = String(args.public_key ?? "").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(pk)) throw new Error("public_key: 64 hex characters");
      const r = await revive(escrow, () => undefined);
      const catalog = CATALOGS[r.state.commitment!.core_sha256];
      const p = r.pkg.players.find((x) => x.pk === pk);
      if (!p) return { escrow, found: false, players: r.pkg.players.length };
      return {
        escrow,
        found: true,
        items: p.items.map(([id, q]) => ({ id, qty: q, name: catalog?.items[id] ?? null })),
      };
    },
  },
  agent_log: {
    description:
      "What the site's preservation agent has done: escrows it released after their studio went silent, and the games it brought back, with every check.",
    input: { type: "object", properties: {} },
    readOnly: true,
    async run() {
      const [actions, revived] = await Promise.all([log(), reports()]);
      return {
        actions: actions.slice(0, 20),
        revived: revived.map((r) => ({
          escrow: r.escrow,
          at: r.at,
          ok: r.ok,
          game: r.game,
          players: r.players,
          items: r.items,
        })),
      };
    },
  },
};

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const ok = (id: Message["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Message["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/** One JSON-RPC message in, its response out; null for a notification, which gets no response. */
export async function handle(m: Message): Promise<Json | null> {
  if (!isRecord(m) || m.jsonrpc !== "2.0" || typeof m.method !== "string")
    return fail(m?.id, -32600, "invalid request");
  if (m.id === undefined) return null;
  switch (m.method) {
    case "initialize": {
      const asked = isRecord(m.params) ? m.params.protocolVersion : undefined;
      return ok(m.id, {
        protocolVersion: typeof asked === "string" && VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "encroe", version: "0.1.0" },
        instructions:
          "Encroe game escrows on NEAR testnet: a studio seals its game server into a keyless contract; while it lives, an enclave checked by NEAR verifies the sealed build; if the studio goes silent past its grace period, anyone may release it and the game goes to its players. Watch escrows, inspect one, release a silent one, bring a released game back, and find a player's items.",
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.input,
          annotations: { readOnlyHint: t.readOnly, openWorldHint: true, destructiveHint: false },
        })),
      });
    case "tools/call": {
      const name = isRecord(m.params) ? m.params.name : undefined;
      const tool = typeof name === "string" ? TOOLS[name] : undefined;
      if (!tool) return fail(m.id, -32602, `unknown tool: ${String(name)}`);
      const args = isRecord(m.params) && isRecord(m.params.arguments) ? m.params.arguments : {};
      try {
        const value = await tool.run(args);
        return ok(m.id, {
          content: [{ type: "text", text: JSON.stringify(value, null, 1) }],
          structuredContent: Array.isArray(value) ? { items: value } : value,
          isError: false,
        });
      } catch (e) {
        return ok(m.id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }
    default:
      return fail(m.id, -32601, `method not found: ${m.method}`);
  }
}
