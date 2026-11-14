"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectNear } from "@/components/wallet/ConnectNear";
import { checkCore, type CoreReport } from "@/lib/cores/check";
import { checkWorld } from "@/lib/cores/worldFile";
import { isEscrowId } from "@/lib/encroe/escrows";
import { storeArgs, VERIFIER_HASH } from "@/lib/encroe/outlayer";
import { bytesToHex, hexToBytes } from "@/lib/encroe/release";
import { packageUrl, RELAYER, viewState, type EscrowState } from "@/lib/encroe/revive";
import { outlayerSecret, sealEpoch, type Sealed, type WorldPlayer } from "@/lib/encroe/seal";
import {
  MPC,
  near,
  nextEpoch,
  OUTLAYER,
  requestIdFromTx,
  requestIdOf,
  storeDeposit,
  verifyDeposit,
} from "@/lib/encroe/sealFlow";
import { Core } from "@/lib/game/core";
import { viewCall } from "@/lib/game/near";
import { send, type Tx } from "@/lib/wallet/near";
import { failure, useNearAccount } from "@/lib/wallet/useNear";

type State = EscrowState & { secret_profile: string; verifier_hash: string };
type Run = {
  kind: string;
  requester: string;
  pkg_sha256: string;
  output: string | null;
  output_ok: boolean;
  t1: string | null;
};
type Prepared = {
  sealed: Omit<Sealed, "secret">;
  epoch: number;
  game: string;
  /** Absent when resuming a seal committed earlier from this browser. */
  store?: ReturnType<typeof storeArgs>;
  storeYocto: bigint;
  verifyYocto: bigint;
};
type Saved = {
  epoch: number;
  game: string;
  packageB64: string;
  commitment: Sealed["commitment"];
  proofs: Sealed["proofs"];
};
type Step =
  | { kind: "idle" }
  | { kind: "busy"; note?: string }
  | { kind: "done"; note: string; hash?: string }
  | { kind: "failed"; note: string };

const OURS = [
  ["embergate", "Embergate (Rust)"],
  ["matchday", "Matchday (C++)"],
  ["neon-city", "Neon City (C)"],
  ["starhaul", "Starhaul (Zig)"],
  ["orchard", "Orchard (Go)"],
] as const;
const TGAS = 10n ** 12n;

const call = (
  receiverId: string,
  methodName: string,
  args: Record<string, unknown>,
  tgas: bigint,
  deposit = 0n,
): Tx => ({
  receiverId,
  actions: [
    { type: "FunctionCall", params: { methodName, args, gas: (tgas * TGAS).toString(), deposit: deposit.toString() } },
  ],
});

/** Sign with the wallet; the outcome, or the contract's own words when it refuses. */
async function sign(tx: Tx): Promise<{ outcome: unknown; hash: string | null }> {
  const outcome = await send(tx);
  const refused = failure((outcome as { status?: unknown })?.status);
  if (refused) throw new Error(refused);
  return { outcome, hash: (outcome as { transaction?: { hash?: string } })?.transaction?.hash ?? null };
}

const reason = (e: unknown) => failure(e) ?? (e instanceof Error ? e.message : String(e));

function download(name: string, bytes: Uint8Array | string, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The sealed package (public ciphertext) and the players' proofs, kept in this browser before anything is sent: an
 * epoch committed without its package could never be verified, so a closed tab resumes instead.
 */
const saved = {
  key: (escrow: string) => `encroe-seal:${escrow}`,
  put(escrow: string, p: Prepared) {
    const { sealed, epoch, game } = p;
    const value: Saved = {
      epoch,
      game,
      packageB64: sealed.packageB64,
      commitment: sealed.commitment,
      proofs: sealed.proofs,
    };
    try {
      localStorage.setItem(saved.key(escrow), JSON.stringify(value));
    } catch {}
  },
  get(escrow: string): Saved | null {
    try {
      return JSON.parse(localStorage.getItem(saved.key(escrow)) ?? "null") as Saved | null;
    } catch {
      return null;
    }
  },
};

/** Three made-up players holding items 1 to 8, for trying the flow on a test escrow. */
function testWorld(): WorldPlayer[] {
  return Array.from({ length: 3 }, (_, p) => ({
    pk: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    items: Array.from({ length: 3 }, (_, i) => [1 + ((p * 3 + i) % 8), 10 * (p + 1) + i] as [number, number]),
  }));
}

/**
 * Seal an epoch from the studio's browser: the core and the world are sealed here, to the key NEAR's MPC network
 * derives for the escrow, and the package key goes only to OutLayer's keystore, encrypted to it. Three wallet
 * signatures (the key row, the commitment, the verification); the site's relayer puts the package on FastFS, and
 * only one the escrow has committed.
 */
export function SealEpoch({ nonce, initial }: { nonce?: string; initial?: string }) {
  const account = useNearAccount();
  const [escrow, setEscrow] = useState(initial ?? "");
  const [state, setState] = useState<State | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [core, setCore] = useState<{ name: string; bytes: Uint8Array; report: CoreReport } | null>(null);
  const [world, setWorld] = useState<{ name: string; players: WorldPlayer[]; issues: string[] } | null>(null);
  const [game, setGame] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [steps, setSteps] = useState<Record<string, Step>>({});
  const step = (id: string, s: Step) => setSteps((cur) => ({ ...cur, [id]: s }));
  const at = (id: string): Step => steps[id] ?? { kind: "idle" };

  const load = (id: string) =>
    viewState(id).then(
      async (s) => {
        setState(s as State);
        setGame(
          (g) => g || s.commitment?.game || id.replace(/\.encroe\.testnet$|\.testnet$/, "").replace(/^encroe-/, ""),
        );
        const kept = saved.get(id);
        if (!kept || !s.commitment || kept.commitment.pkg_sha256 !== s.commitment.pkg_sha256) return;
        const bytes = Uint8Array.from(atob(kept.packageB64), (ch) => ch.charCodeAt(0));
        const sealed = { commitment: kept.commitment, sealed: bytes, packageB64: kept.packageB64, proofs: kept.proofs };
        const verifyYocto = await verifyDeposit(kept.packageB64.length).catch(() => 0n);
        setPrepared({ sealed, epoch: kept.epoch, game: kept.game, storeYocto: 0n, verifyYocto });
        const note = `epoch ${kept.epoch}, sealed and committed earlier from this browser`;
        setSteps({ seal: { kind: "done", note }, key: { kind: "done", note }, commit: { kind: "done", note } });
      },
      (e) => setStateError(reason(e)),
    );

  function open(id = escrow.trim()) {
    setState(null);
    setStateError(null);
    setPrepared(null);
    setSteps({});
    if (!isEscrowId(id)) return setStateError("an Encroe escrow: <name>.encroe.testnet or encroe-<name>.testnet");
    void load(id);
  }

  useEffect(() => {
    if (initial && isEscrowId(initial)) void load(initial);
  }, [initial]);

  async function loadCore(name: string, bytes: Uint8Array) {
    setPrepared(null);
    setCore({ name, bytes, report: await checkCore(bytes) });
  }

  function loadWorld(name: string, text: string) {
    setPrepared(null);
    const { issues } = checkWorld(text);
    setWorld({ name, issues, players: issues.length ? [] : (JSON.parse(text) as WorldPlayer[]) });
  }

  const owner = state?.owner ?? null;
  const isOwner = !!account && account === owner;
  const blocked = !state
    ? "Open your escrow first."
    : state.released
      ? "This escrow is released: its game belongs to its players now."
      : state.verifier_hash !== VERIFIER_HASH
        ? "This escrow pins another verifier build."
        : !account
          ? "Connect the studio's wallet."
          : !isOwner
            ? `Only the studio (${owner}) can seal this escrow; connect that account.`
            : !core?.report.ok
              ? "Add a core that passes every check."
              : !world || world.issues.length
                ? "Add a players file that passes every check."
                : !/^[a-z0-9-]{1,32}$/.test(game)
                  ? "Name the game: lowercase letters, digits and dashes."
                  : null;

  async function seal() {
    if (blocked || !state || !core || !world || !account) return;
    step("seal", { kind: "busy", note: "sealing in your browser…" });
    try {
      const epoch = nextEpoch(state.commitment);
      const ckdPk = await viewCall<string>(MPC, "public_key", { domain_id: 2 });
      const sealed = await sealEpoch({
        escrow: escrow.trim(),
        path: state.path,
        game,
        epoch,
        ckdPk,
        core: core.bytes,
        world: world.players,
      });
      // What the enclave samples: the sealed world goes into the core and comes back byte for byte.
      const loaded = await Core.create(await WebAssembly.compile(core.bytes as BufferSource));
      const seats = sealed.proofs.map((p) => ({ pk: hexToBytes(p.pk), items: p.items }));
      loaded.load(seats);
      const served =
        JSON.stringify(loaded.seats().map((s) => [bytesToHex(s.pk), s.items])) ===
        JSON.stringify(seats.map((s) => [bytesToHex(s.pk), s.items]));
      if (!served) throw new Error("your core does not serve this world exactly as sealed; nothing was sent");
      step("seal", { kind: "busy", note: "fetching OutLayer's keystore key…" });
      const res = await fetch("/api/seal/outlayer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ escrow: escrow.trim(), epoch, owner: account }),
      });
      const out = (await res.json()) as { pubkey?: string; profile?: string; error?: string };
      if (!res.ok || !out.pubkey || !out.profile) throw new Error(out.error ?? `HTTP ${res.status}`);
      const store = storeArgs(out.profile, escrow.trim(), outlayerSecret(out.pubkey, sealed.secret.k, sealed.secret.r));
      const [storeYocto, verifyYocto] = await Promise.all([
        storeDeposit(store, account),
        verifyDeposit(sealed.packageB64.length),
      ]);
      // The package key is in the encrypted row now; the page keeps no copy.
      sealed.secret.k.fill(0);
      sealed.secret.r.fill(0);
      const ready = { sealed, epoch, game, store, storeYocto, verifyYocto };
      saved.put(escrow.trim(), ready);
      setPrepared(ready);
      step("seal", {
        kind: "done",
        note: `epoch ${epoch}: ${sealed.commitment.players} players, package ${sealed.commitment.pkg_sha256.slice(0, 12)}…`,
      });
    } catch (e) {
      step("seal", { kind: "failed", note: reason(e) });
    }
  }

  async function storeKey() {
    if (!prepared?.store) return;
    step("key", { kind: "busy", note: "waiting for your wallet…" });
    try {
      const { hash } = await sign(call(OUTLAYER, "store_secrets", prepared.store, 100n, prepared.storeYocto));
      step("key", {
        kind: "done",
        note: `readable only by verifier ${VERIFIER_HASH.slice(0, 8)}… called by ${escrow}`,
        hash: hash ?? undefined,
      });
    } catch (e) {
      step("key", { kind: "failed", note: reason(e) });
    }
  }

  async function commit() {
    if (!prepared) return;
    step("commit", { kind: "busy", note: "waiting for your wallet…" });
    try {
      const { hash } = await sign(call(escrow.trim(), "commit", { commitment: prepared.sealed.commitment }, 30n));
      step("commit", {
        kind: "done",
        note: `root ${prepared.sealed.commitment.root.slice(0, 12)}… on NEAR`,
        hash: hash ?? undefined,
      });
      await publish();
    } catch (e) {
      step("commit", { kind: "failed", note: reason(e) });
    }
  }

  async function publish() {
    if (!prepared) return;
    step("fastfs", { kind: "busy", note: "putting the package on NEAR…" });
    try {
      const res = await fetch("/api/seal/fastfs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ escrow: escrow.trim(), package_b64: prepared.sealed.packageB64 }),
      });
      const out = (await res.json()) as { url?: string; tx?: string; error?: string };
      if (!res.ok || !out.url) throw new Error(out.error ?? `HTTP ${res.status}`);
      step("fastfs", { kind: "done", note: out.url, hash: out.tx });
    } catch (e) {
      step("fastfs", { kind: "failed", note: reason(e) });
    }
  }

  async function verify() {
    if (!prepared || !account) return;
    const id = escrow.trim();
    step("verify", { kind: "busy", note: "waiting for your wallet…" });
    const before = (await viewCall<Run[]>(id, "get_runs")).length;
    let hash: string | null = null;
    let request: number | null = null;
    try {
      const signed = await sign(
        call(id, "verify", { package_b64: prepared.sealed.packageB64 }, 300n, prepared.verifyYocto),
      );
      hash = signed.hash;
      request = requestIdOf(signed.outcome);
    } catch (e) {
      // A wallet may give up waiting on the enclave while the run goes on; the escrow's own record decides.
      const runs = await viewCall<Run[]>(id, "get_runs").catch(() => []);
      if (runs.length <= before) return step("verify", { kind: "failed", note: reason(e) });
    }
    step("verify", { kind: "busy", note: "the enclave is running the pinned verifier on your package…" });
    for (let i = 0; i < 60; i++) {
      const runs = await viewCall<Run[]>(id, "get_runs").catch(() => [] as Run[]);
      const index = runs.findIndex(
        (r, j) =>
          j >= before &&
          r.kind === "verify" &&
          r.requester === account &&
          r.pkg_sha256 === prepared.sealed.commitment.pkg_sha256,
      );
      const run = runs[index];
      if (run?.output) {
        if (!run.output_ok)
          return step("verify", {
            kind: "failed",
            note: `run ${index}: the enclave's checks failed; the badge is red`,
          });
        step("verify", {
          kind: "done",
          note: `run ${index}: every check passed in the enclave`,
          hash: hash ?? undefined,
        });
        if (request === null && hash) request = await requestIdFromTx(hash, account).catch(() => null);
        return queue(index, request);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    step("verify", { kind: "failed", note: "no answer from the enclave in five minutes; check the escrow page later" });
  }

  async function queue(index: number, request: number | null) {
    if (request === null)
      return step("prove", {
        kind: "failed",
        note: "your wallet did not return the transaction, so the run's OutLayer request id is unknown",
      });
    step("prove", { kind: "busy" });
    const res = await fetch("/api/seal/prove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ escrow: escrow.trim(), index, request_id: request }),
    });
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    step(
      "prove",
      res.ok
        ? {
            kind: "done",
            note: `request ${request} queued: the prover relays its quote to NEAR's DCAP verifier within 30 minutes`,
          }
        : { kind: "failed", note: out.error ?? `HTTP ${res.status}` },
    );
  }

  const done = (id: string) => at(id).kind === "done";
  const p = prepared;

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-h2 font-black">1 · Your escrow and your wallet</h2>
        <div className="mt-4">
          <ConnectNear nonce={nonce} />
        </div>
        <form
          className="mt-5 flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            open();
          }}
        >
          <input
            value={escrow}
            onChange={(e) => setEscrow(e.target.value.trim().toLowerCase())}
            placeholder="your-game.encroe.testnet"
            aria-label="Escrow account"
            className="min-w-72 flex-1 rounded-md border border-line-strong bg-night px-3 py-2.5 font-mono text-sm outline-none focus:border-acid"
          />
          <button className="rounded-md border border-line-strong px-5 py-2.5 font-display text-sm font-bold hover:border-acid">
            Open
          </button>
        </form>
        {stateError && (
          <p role="alert" className="mt-3 text-sm text-flare">
            {stateError}
          </p>
        )}
        {state && (
          <dl className="mt-4 grid gap-x-6 gap-y-1 font-mono text-xs text-ink-2 sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-3">studio</dt>
            <dd className={isOwner ? "text-acid" : ""}>
              {state.owner}
              {isOwner ? " (you)" : ""}
            </dd>
            <dt className="text-ink-3">sealed so far</dt>
            <dd>
              {state.commitment
                ? `epoch ${state.commitment.epoch}, ${state.commitment.players} players`
                : "nothing yet"}
            </dd>
            <dt className="text-ink-3">this seal</dt>
            <dd>
              epoch {nextEpoch(state.commitment)}, key path {state.path}
            </dd>
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="font-display text-h2 font-black">2 · Your core and your world</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold">Server core (.wasm)</p>
            <input
              type="file"
              accept=".wasm,application/wasm"
              aria-label="Server core"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await loadCore(f.name, new Uint8Array(await f.arrayBuffer()));
              }}
              className="mt-2 block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-raise file:px-3 file:py-2 file:text-ink"
            />
            <p className="mt-2 text-xs text-ink-3">
              or one of ours:{" "}
              {OURS.map(([id, label], i) => (
                <span key={id}>
                  {i > 0 && " · "}
                  <button
                    type="button"
                    className="underline underline-offset-4 hover:text-ink"
                    onClick={async () =>
                      loadCore(`${id}.wasm`, new Uint8Array(await (await fetch(`/core/${id}.wasm`)).arrayBuffer()))
                    }
                  >
                    {label}
                  </button>
                </span>
              ))}
            </p>
            {core && (
              <p className={`mt-2 font-mono text-xs ${core.report.ok ? "text-acid" : "text-flare"}`}>
                {core.name}: {core.report.checks.filter((c) => c.ok).length}/{core.report.checks.length} checks
                {core.report.ok ? " passed" : ` · ${core.report.checks.find((c) => !c.ok)?.detail}`} ·{" "}
                <Link href="/tools#core" className="underline underline-offset-4">
                  details
                </Link>
              </p>
            )}
          </div>
          <div>
            <p className="text-sm font-bold">Players (players.json)</p>
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Players file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) loadWorld(f.name, await f.text());
              }}
              className="mt-2 block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-raise file:px-3 file:py-2 file:text-ink"
            />
            <p className="mt-2 text-xs text-ink-3">
              <code>
                [{"{"}&quot;pk&quot;: hex, &quot;items&quot;: [[id, qty], …]{"}"}, …]
              </code>{" "}
              · or{" "}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-ink"
                onClick={() => loadWorld("test world", JSON.stringify(testWorld()))}
              >
                three made-up players
              </button>{" "}
              for a test escrow
            </p>
            {world && (
              <p className={`mt-2 font-mono text-xs ${world.issues.length ? "text-flare" : "text-acid"}`}>
                {world.name}:{" "}
                {world.issues.length ? world.issues[0] : `${world.players.length} players, every check passed`}
              </p>
            )}
          </div>
        </div>
        <label className="mt-5 grid max-w-sm gap-1.5">
          <span className="text-sm font-bold">Game id</span>
          <input
            value={game}
            onChange={(e) => setGame(e.target.value.trim().toLowerCase())}
            className="rounded-md border border-line-strong bg-night px-3 py-2.5 font-mono text-sm outline-none focus:border-acid"
          />
          <span className="font-mono text-[11px] text-ink-3">
            bound into the package&apos;s encryption; keep it the same every epoch
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-acid/40 bg-panel p-6 shadow-acid">
        <h2 className="font-display text-h2 font-black">3 · Seal, commit, verify</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          Your players&apos; items and your core are encrypted here, in this tab. The key that opens them leaves it only
          inside a row encrypted to OutLayer&apos;s keystore, readable by the pinned verifier alone when your escrow
          calls it.
        </p>
        <ol className="mt-6 grid gap-3">
          <Row n="a" title="Seal in your browser" s={at("seal")}>
            <Action disabled={!!blocked || at("seal").kind === "busy" || done("key")} onClick={seal}>
              {done("seal") ? "Seal again" : "Seal"}
            </Action>
            {blocked && !done("seal") && <span className="text-xs text-gold">{blocked}</span>}
          </Row>
          <Row n="b" title="Give the package key to the enclave's keystore" s={at("key")} wallet>
            <Action disabled={!p || done("key") || at("key").kind === "busy"} onClick={storeKey}>
              Store it{p ? ` · ${near(p.storeYocto)}` : ""}
            </Action>
          </Row>
          <Row n="c" title="Commit the epoch to your escrow" s={at("commit")} wallet>
            <Action disabled={!done("key") || done("commit") || at("commit").kind === "busy"} onClick={commit}>
              Commit
            </Action>
          </Row>
          <Row n="d" title="Put the sealed package on NEAR (FastFS)" s={at("fastfs")}>
            {done("commit") && (at("fastfs").kind === "failed" || at("fastfs").kind === "idle") && (
              <Action onClick={publish}>{at("fastfs").kind === "failed" ? "Try again" : "Put it on NEAR"}</Action>
            )}
          </Row>
          <Row n="e" title="Have the enclave verify it" s={at("verify")} wallet>
            <Action disabled={!done("fastfs") || done("verify") || at("verify").kind === "busy"} onClick={verify}>
              Verify{p ? ` · ${near(p.verifyYocto)}, mostly refunded` : ""}
            </Action>
          </Row>
          <Row n="f" title="NEAR's own check of the enclave's quote" s={at("prove")} />
        </ol>
        {p && (
          <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5 text-sm">
            <button
              className="rounded-md border border-line-strong px-4 py-2 hover:border-acid"
              onClick={() =>
                download(
                  `${p.game}-epoch-${p.epoch}-proofs.json`,
                  JSON.stringify(
                    { escrow, epoch: p.epoch, root: p.sealed.commitment.root, proofs: p.sealed.proofs },
                    null,
                    1,
                  ),
                  "application/json",
                )
              }
            >
              Players&apos; proofs (give each player theirs)
            </button>
            <button
              className="rounded-md border border-line-strong px-4 py-2 hover:border-acid"
              onClick={() => download(`${p.sealed.commitment.pkg_sha256}.sealed`, p.sealed.sealed)}
            >
              The sealed package
            </button>
            {done("verify") && (
              <Link href={`/escrow/${escrow}`} className="rounded-md bg-acid px-4 py-2 font-bold text-void">
                Open your escrow&apos;s page
              </Link>
            )}
          </div>
        )}
        {p && (
          <p className="mt-3 font-mono text-[11px] text-ink-3">
            package at {packageUrl(RELAYER, escrow, p.sealed.commitment.pkg_sha256)} once step d is done
          </p>
        )}
      </section>
    </div>
  );
}

function Row({
  n,
  title,
  s,
  wallet,
  children,
}: {
  n: string;
  title: string;
  s: Step;
  wallet?: boolean;
  children?: React.ReactNode;
}) {
  const tone =
    s.kind === "done"
      ? "text-acid"
      : s.kind === "failed"
        ? "text-flare"
        : s.kind === "busy"
          ? "text-gold"
          : "text-ink-3";
  return (
    <li className="grid gap-2 rounded-lg border border-line bg-night/60 p-4 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
      <span className={`font-display text-xl font-black ${tone}`}>
        {s.kind === "done" ? "✓" : s.kind === "failed" ? "✕" : n}
      </span>
      <div className="min-w-0">
        <p className="font-bold">
          {title}
          {wallet && <span className="ml-2 font-mono text-[10px] tracking-widest text-ink-3 uppercase">wallet</span>}
        </p>
        {"note" in s && s.note && (
          <p
            role={s.kind === "failed" ? "alert" : undefined}
            className={`mt-1 truncate font-mono text-xs ${tone}`}
            title={s.note}
          >
            {s.note}
            {"hash" in s && s.hash && (
              <>
                {" · "}
                <a href={`https://testnet.nearblocks.io/txns/${s.hash}`} className="underline underline-offset-4">
                  tx
                </a>
              </>
            )}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </li>
  );
}

function Action({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-acid px-4 py-2 font-display text-xs font-bold tracking-wide text-void uppercase transition hover:shadow-acid disabled:opacity-30"
    >
      {children}
    </button>
  );
}
