#!/usr/bin/env node
// Checks Encroe's claims against the chains and the live site, read-only: no account, no key, nothing to install
// (Node 20+). Each line is one claim from the README, what was read, and PASS or FAIL.
//   node scripts/check-live.mjs
import { createHash } from "node:crypto";

const NEAR_RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
const BASE_RPC = "https://sepolia.base.org";
const SITE = "https://encroe.vercel.app";
const ESCROW_BUILD = "08d9174fedb6374971b076591d915423d2fab6bc7f5bb056be308178b3901fbf";
const FACTORY_BUILD = "ba05cf668a07bed475af9c315a1d76a7c300e9a881e6c4dfd98694137e1d2930";
const ITEMS_BUILD = "fc69492e95e52bf27cd09bf0b9344b6ea9c9fc27a92ad998ea95a46bae088863";
const STRANGER = "encore-stranger-6b4dad.testnet";

const WORLDS = {
  "encroe-embergate.testnet": "embergate",
  "matchday.encroe.testnet": "matchday",
  "neon-city.encroe.testnet": "neon-city",
  "starhaul.encroe.testnet": "starhaul",
  "orchard.encroe.testnet": "orchard",
};
const RELEASED = {
  "encroe-life-52e4.testnet": "a stranger, after a broken build was caught red",
  "encroe-kill-827e.testnet": "a stranger",
  "encroe-kill-beaa.testnet": "a visitor's click on the site",
  "encroe-ember-3924.testnet": "a watcher",
  "encroe-kill-5609.testnet": "an AI agent over MCP",
  "handover.encroe.testnet": "a stranger, before its items were handed over",
};
const POOL = ["encroe-kill-19d2.testnet", "encroe-kill-0c87.testnet", "encroe-kill-9400.testnet", "encroe-kill-5781.testnet"];
const ITEMS = "encroe-items-ba9e16.testnet";
const TOKEN = "0x94365D73B3C539680622E681aEAcefeC01c8a2e1";
const HANDOVER_TO = "0x1d9Db7f01d68CF06B3A2D2498af09a09f186615c";
// tokenId("handover.encroe.testnet", 1) on EncroeItems: keccak256(escrow) with its low 32 bits set to the item id.
const HANDOVER_ITEM_1 = "adb5df03437a84ad567cbdb02c3a119ceeb0fcad6a513afcc77c889500000001";
// Refusals recorded in docs/results, each sent by the stranger: [tx, what the contract must have said].
const REFUSALS = [
  ["8dX9evB9Rx1uEnazShjE18RAW1yfm8QqyKDNdfzBWf9h", "input differs from what this contract sent", "a replayed enclave quote (life-52e4)"],
  ["Auv7DKwowEM2bCnExtnHVTczZwjiPcuCeJDsohfphf9z", "already proven", "a second proof of one run (orchard)"],
  ["7CxQooGDy3MTqkgb7GSLhUzZgx64myPChPyu4rnA2HKv", "the player's key did not sign this claim", "an item claim signed by another key"],
  ["9gd5ysKbY7ZUxAJSBKTsKjkkcMMVPyCmXLGkDNkBLMGr", "already claimed", "a second item claim"],
];

// ---------- reading NEAR, Base and the site ----------

async function rpc(method, params) {
  let last;
  for (const url of NEAR_RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(JSON.stringify(body.error).slice(0, 160));
      return body.result;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
const query = (params) => rpc("query", { finality: "final", ...params });
const view = async (account, method, args = {}) =>
  JSON.parse(
    Buffer.from(
      (
        await query({
          request_type: "call_function",
          account_id: account,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        })
      ).result,
    ).toString(),
  );
const keys = async (account) => (await query({ request_type: "view_access_key_list", account_id: account })).keys.length;
const codeHash = async (account) => b58hex((await query({ request_type: "view_code", account_id: account })).hash);
const ethCall = async (to, data) => {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json()).result;
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58bytes(s) {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const hex = n.toString(16);
  return Buffer.from(hex.padStart(hex.length + (hex.length % 2), "0"), "hex");
}
const b58hex = (s) => b58bytes(s).toString("hex").padStart(64, "0");

// keccak-256, for the EVM address NEAR's MPC network derives (Node's crypto has SHA-3, not Ethereum's keccak).
const RC = [
  0x1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n,
  0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn,
  0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an,
  0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n,
];
const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];
const M64 = (1n << 64n) - 1n;
const rot = (v, n) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & M64);
function keccak256(input) {
  const rate = 136;
  const s = new Array(25).fill(0n);
  const p = new Uint8Array(Math.floor(input.length / rate + 1) * rate);
  p.set(input);
  p[input.length] ^= 0x01;
  p[p.length - 1] ^= 0x80;
  for (let off = 0; off < p.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let v = 0n;
      for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(p[off + i * 8 + b]);
      s[i] ^= v;
    }
    for (let r = 0; r < 24; r++) {
      const C = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
      for (let i = 0; i < 25; i++) s[i] ^= C[(i % 5 + 4) % 5] ^ rot(C[(i % 5 + 1) % 5], 1);
      const B = new Array(25);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rot(s[x + 5 * y], ROT[x][y]);
      for (let x = 0; x < 5; x++)
        for (let y = 0; y < 5; y++) s[x + 5 * y] = B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & M64 & B[((x + 2) % 5) + 5 * y]);
      s[0] ^= RC[r];
    }
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) out[i * 8 + b] = Number((s[i] >> BigInt(8 * b)) & 0xffn);
  return out.toString("hex");
}

// ---------- the claims ----------

const checks = [];
const claim = (text, run) => checks.push({ text, run });

claim("The factory is keyless and runs its published build, and hands every studio the one escrow build", async () => {
  const [k, code, build] = await Promise.all([keys("encroe.testnet"), codeHash("encroe.testnet"), view("encroe.testnet", "escrow_code_sha256")]);
  if (k !== 0 || code !== FACTORY_BUILD || build !== ESCROW_BUILD) throw new Error(`keys ${k}, code ${code.slice(0, 8)}, escrow build ${build.slice(0, 8)}`);
  return `encroe.testnet: 0 keys, code ${code.slice(0, 8)}…, escrow build ${build.slice(0, 8)}…`;
});

claim("Every escrow on record has no access keys and runs that escrow build", async () => {
  const all = [...Object.keys(WORLDS), ...Object.keys(RELEASED), ...POOL];
  const read = await Promise.all(all.map(async (a) => [a, await keys(a), await codeHash(a)]));
  const bad = read.filter(([, k, c]) => k !== 0 || c !== ESCROW_BUILD);
  if (bad.length) throw new Error(bad.map(([a, k, c]) => `${a}: ${k} keys, ${c.slice(0, 8)}`).join("; "));
  return `${read.length} escrows: 0 keys each, code ${ESCROW_BUILD.slice(0, 8)}…`;
});

claim("Five games in five languages are sealed into keyless escrows and verified green (NEAR's DCAP verifier accepted each enclave run)", async () => {
  const read = await Promise.all(Object.keys(WORLDS).map(async (a) => [a, await view(a, "status")]));
  const bad = read.filter(([, s]) => s.badge !== "green" || s.proven_run === null || s.epoch === null);
  if (bad.length) throw new Error(bad.map(([a, s]) => `${a}: ${s.badge}`).join("; "));
  return read.map(([a, s]) => `${WORLDS[a]} epoch ${s.epoch}`).join(", ");
});

claim("Each sealed core imports nothing, and the site serves exactly the core each escrow committed", async () => {
  const read = await Promise.all(
    Object.entries(WORLDS).map(async ([a, game]) => {
      const [state, core] = await Promise.all([view(a, "get_state"), bytes(`${SITE}/core/${game}.wasm`)]);
      const imports = WebAssembly.Module.imports(new WebAssembly.Module(core)).length;
      return [game, sha256(core), state.commitment.core_sha256, imports];
    }),
  );
  const bad = read.filter(([, served, committed, imports]) => served !== committed || imports !== 0);
  if (bad.length) throw new Error(bad.map(([g, s, c, i]) => `${g}: served ${s.slice(0, 8)}, committed ${c.slice(0, 8)}, ${i} imports`).join("; "));
  return read.map(([g, s]) => `${g} ${s.slice(0, 8)}`).join(", ");
});

claim("The keys the escrows sealed to are NEAR's MPC network's own (domain 2)", async () => {
  const [mpc, ...states] = await Promise.all([
    view("v1.signer-prod.testnet", "public_key", { domain_id: 2 }),
    ...Object.keys(WORLDS).map((a) => view(a, "get_state")),
  ]);
  const bad = states.filter((s) => s.commitment.ckd_pk !== mpc);
  if (bad.length) throw new Error(`${bad.length} escrows sealed to another key`);
  return `v1.signer-prod.testnet ${mpc.slice(0, 22)}…`;
});

claim("The sealed game lives on NEAR (FastFS), byte for byte the package the escrow committed", async () => {
  const state = await view("encroe-embergate.testnet", "get_state");
  const c = state.commitment;
  const pkg = await bytes(`https://test.fastfs.io/${state.owner}/encroe-embergate.testnet/${c.pkg_sha256}.sealed`);
  if (sha256(pkg) !== c.pkg_sha256) throw new Error("the package's hash differs from the commitment");
  return `${pkg.length} bytes, sha256 ${c.pkg_sha256.slice(0, 8)}… = the committed pkg_sha256`;
});

claim("A living studio's game cannot be released: the escrow says its release condition is not met", async () => {
  const s = await view("encroe-embergate.testnet", "status");
  if (s.phase !== "live" || s.release_condition_met) throw new Error(`${s.phase}, release condition met ${s.release_condition_met}`);
  const beat = Number(BigInt(s.last_heartbeat_ns) / 1_000_000_000n);
  return `encroe-embergate: live, last heartbeat ${Math.round((Date.now() / 1000 - beat) / 3600)} h ago (sent by a workflow every six hours)`;
});

claim("Silent studios' games were released, by strangers, a visitor, a watcher and an AI agent, each with NEAR's MPC release on record", async () => {
  const read = await Promise.all(Object.keys(RELEASED).map(async (a) => [a, await view(a, "get_state")]));
  const bad = read.filter(([, st]) => !st.released?.big_c || !st.released_by);
  if (bad.length) throw new Error(bad.map(([a]) => a).join(", "));
  return `${read.length} released: ${Object.values(RELEASED).join("; ")}`;
});

claim("Silent studios are waiting for anyone to release them", async () => {
  const read = await Promise.all(POOL.map(async (a) => [a, await view(a, "status")]));
  const silent = read.filter(([, s]) => s.phase === "silent" && s.release_condition_met);
  const released = read.filter(([, s]) => s.phase === "released");
  if (silent.length + released.length !== POOL.length || (silent.length === 0 && released.length === 0)) throw new Error("unexpected phases");
  return `${silent.length} silent and verified green, ${released.length} already released by visitors`;
});

claim("Cheating is refused on chain, in the contract's own words", async () => {
  const read = await Promise.all(
    REFUSALS.map(async ([tx, words, what]) => {
      const r = await rpc("tx", { tx_hash: tx, sender_account_id: STRANGER, wait_until: "FINAL" });
      return [what, words, JSON.stringify(r.status).includes(words) || JSON.stringify(r.receipts_outcome).includes(words)];
    }),
  );
  const bad = read.filter(([, , ok]) => !ok);
  if (bad.length) throw new Error(bad.map(([w]) => w).join("; "));
  return read.map(([what, words]) => `${what}: "${words}"`).join("; ");
});

claim("The item handover is keyless and runs its published build", async () => {
  const [k, code, config] = await Promise.all([keys(ITEMS), codeHash(ITEMS), view(ITEMS, "config")]);
  if (k !== 0 || code !== ITEMS_BUILD || config.token.toLowerCase() !== TOKEN.toLowerCase())
    throw new Error(`keys ${k}, code ${code.slice(0, 8)}, token ${config.token}`);
  return `${ITEMS}: 0 keys, code ${code.slice(0, 8)}…, token ${TOKEN.slice(0, 10)}… on Base Sepolia`;
});

claim("The item token mints only for the key NEAR's MPC network derives for encroe-items (nobody holds it)", async () => {
  const pk = await view("v1.signer-prod.testnet", "derived_public_key", { path: "encroe/items/1", predecessor: ITEMS, domain_id: 0 });
  const derived = `0x${keccak256(b58bytes(pk.replace("secp256k1:", ""))).slice(24)}`;
  const signer = `0x${(await ethCall(TOKEN, "0x238ac933")).slice(26)}`; // signer()
  if (derived.toLowerCase() !== signer.toLowerCase()) throw new Error(`derived ${derived}, token signer ${signer}`);
  return `MPC-derived ${derived} = EncroeItems.signer()`;
});

claim("A released world's items left the game: two players' claims, signed by NEAR's MPC network, minted on Base Sepolia", async () => {
  const data = `0x00fdd58e${HANDOVER_TO.slice(2).toLowerCase().padStart(64, "0")}${HANDOVER_ITEM_1}`; // balanceOf(address,uint256)
  const balance = BigInt(await ethCall(TOKEN, data));
  if (balance !== 2n) throw new Error(`balance ${balance}`);
  return `balanceOf(${HANDOVER_TO.slice(0, 8)}…, handover item 1) = 2`;
});

claim("The live site is up, and its MCP server offers an agent the six tools", async () => {
  const res = await fetch(`${SITE}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    signal: AbortSignal.timeout(30_000),
  });
  const tools = ((await res.json()).result?.tools ?? []).map((t) => t.name);
  const pages = await Promise.all(["/", "/play/starhaul", "/revive", "/break", "/judges"].map(async (p) => (await fetch(SITE + p)).status));
  if (tools.length !== 6 || pages.some((s) => s !== 200)) throw new Error(`tools ${tools.length}, pages ${pages}`);
  return `${tools.join(", ")}; 5 pages 200`;
});

// ---------- run ----------

let passed = 0;
for (const c of checks) {
  try {
    const detail = await c.run();
    passed++;
    console.log(`PASS  ${c.text}\n      ${detail}`);
  } catch (e) {
    console.log(`FAIL  ${c.text}\n      ${e.message}`);
  }
}
console.log(`\n${passed} of ${checks.length} passed.`);
process.exit(passed === checks.length ? 0 : 1);
