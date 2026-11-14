import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { functionCall } from "@/lib/chain/tx";
import { checkCore } from "@/lib/cores/check";
import { checkWorld } from "@/lib/cores/worldFile";
import { storeArgs } from "@/lib/encroe/outlayer";
import { sha256Hex } from "@/lib/encroe/release";
import { viewState } from "@/lib/encroe/revive";
import { outlayerSecret, sealEpoch, type WorldPlayer } from "@/lib/encroe/seal";
import { MPC, nextEpoch, OUTLAYER, requestIdFromTx, storeDeposit, verifyDeposit } from "@/lib/encroe/sealFlow";
import { viewCall } from "@/lib/game/near";

/**
 * /studios/seal's code path, on testnet, signed with the studio's key in place of a wallet: seal a live world with
 * lib/encroe/seal.ts, store its key row, commit, put the package on FastFS through the site's relayer route, have
 * the enclave verify it, and queue the run for the prover. Every step is recorded in docs/results/escrow/browser-seal/.
 *
 *   ESCROW=neon-city.encroe.testnet GAME=neon-city npx vitest run -c vitest.live.config.ts
 */
const ESCROW = process.env.ESCROW ?? "neon-city.encroe.testnet";
const GAME = process.env.GAME ?? "neon-city";
const SITE = process.env.SITE ?? "http://localhost:3000";
const ROOT = path.join(__dirname, "../../..");
const OUT = path.join(ROOT, "docs/results/escrow/browser-seal");
const env = (file: string) =>
  Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_a-z0-9]+)=(.*)$/))
      .filter((m) => m !== null)
      .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );

it("seals, commits and verifies a live world from the browser's code", async () => {
  mkdirSync(OUT, { recursive: true });
  const log = (step: string, entry: object) => {
    const line = { at: Math.floor(Date.now() / 1000), step, ...entry };
    appendFileSync(path.join(OUT, "log.jsonl"), JSON.stringify(line) + "\n");
    console.log(JSON.stringify(line));
  };
  const studio = env(path.join(ROOT, ".env")).pub;
  const key = JSON.parse(
    readFileSync(path.join(homedir(), `.near-credentials/testnet/${studio}.json`), "utf8"),
  ).private_key;
  const token = env(path.join(ROOT, "web/.env.local")).ENCROE_STUDIO_TOKEN;
  const post = async (url: string, body: object, auth = false) => {
    const res = await fetch(SITE + url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(`${url}: ${JSON.stringify(out)}`);
    return out;
  };

  const state = (await viewState(ESCROW)) as Awaited<ReturnType<typeof viewState>> & { secret_profile: string };
  expect(state.owner).toBe(studio);
  const epoch = nextEpoch(state.commitment);
  const worldRes = await fetch(`${SITE}/api/studio/world?game=${GAME}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const worldText = await worldRes.text();
  expect(checkWorld(worldText).issues).toEqual([]);
  const world = JSON.parse(worldText) as WorldPlayer[];
  const core = new Uint8Array(readFileSync(path.join(ROOT, `web/public/core/${GAME}.wasm`)));
  expect((await checkCore(core)).ok).toBe(true);

  const ckdPk = await viewCall<string>(MPC, "public_key", { domain_id: 2 });
  const sealed = await sealEpoch({ escrow: ESCROW, path: state.path, game: GAME, epoch, ckdPk, core, world });
  const c = sealed.commitment;
  // The package is public ciphertext, kept before anything is sent: a committed epoch without it can never be verified.
  mkdirSync(path.join(OUT, `epoch-${epoch}`), { recursive: true });
  writeFileSync(path.join(OUT, `epoch-${epoch}/commitment.json`), JSON.stringify({ escrow: ESCROW, ...c }, null, 1));
  writeFileSync(path.join(OUT, `epoch-${epoch}/package.sealed`), sealed.sealed);
  log("seal", { escrow: ESCROW, epoch, players: c.players, pkg_sha256: c.pkg_sha256, core_sha256: c.core_sha256 });

  const { pubkey, profile } = await post("/api/seal/outlayer", { escrow: ESCROW, epoch, owner: studio });
  const store = storeArgs(profile, ESCROW, outlayerSecret(pubkey, sealed.secret.k, sealed.secret.r));
  sealed.secret.k.fill(0);
  sealed.secret.r.fill(0);
  const stored = await functionCall(studio, key, OUTLAYER, "store_secrets", store, 100, {
    settle: true,
    depositYocto: await storeDeposit(store, studio),
  });
  log("key-row", { tx: stored.hash, refused: stored.refusal, profile });
  expect(stored.refusal).toBeNull();

  const committed = await functionCall(studio, key, ESCROW, "commit", { commitment: c }, 30, { settle: true });
  log("commit", { tx: committed.hash, refused: committed.refusal });
  expect(committed.refusal).toBeNull();

  const fastfs = await post("/api/seal/fastfs", { escrow: ESCROW, package_b64: sealed.packageB64 });
  log("fastfs", { tx: fastfs.tx, url: fastfs.url });
  let served = "";
  for (let i = 0; i < 30 && served !== c.pkg_sha256; i++) {
    const res = await fetch(fastfs.url, { cache: "no-store" });
    if (res.ok) served = sha256Hex(new Uint8Array(await res.arrayBuffer()));
    else await new Promise((r) => setTimeout(r, 5000));
  }
  log("fastfs-served", { url: fastfs.url, sha256: served, matches: served === c.pkg_sha256 });
  expect(served).toBe(c.pkg_sha256);

  const players = sealed.proofs;
  writeFileSync(path.join(ROOT, `.secrets/escrow/browser-seal-${GAME}-${epoch}-players.json`), JSON.stringify(players));
  await post(
    `/api/studio/sealed?game=${GAME}`,
    { escrow: ESCROW, epoch, root: c.root, sealed_at: Date.now(), players },
    true,
  );

  const before = (await viewCall<unknown[]>(ESCROW, "get_runs")).length;
  const asked = await functionCall(studio, key, ESCROW, "verify", { package_b64: sealed.packageB64 }, 300, {
    depositYocto: await verifyDeposit(sealed.packageB64.length),
  });
  log("verify", { tx: asked.hash });
  type Run = { kind: string; output: string | null; output_ok: boolean };
  let run: Run | undefined;
  for (let i = 0; i < 60 && !run?.output; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    run = (await viewCall<Run[]>(ESCROW, "get_runs"))[before];
  }
  const request = await requestIdFromTx(asked.hash, studio);
  log("verify-done", { run: before, request_id: request, output_ok: run?.output_ok ?? null });
  expect(run?.output_ok).toBe(true);
  expect(request).not.toBeNull();

  const queued = await post("/api/seal/prove", { escrow: ESCROW, index: before, request_id: request });
  log("prove-queued", { run: before, request_id: request, ...queued });
});
