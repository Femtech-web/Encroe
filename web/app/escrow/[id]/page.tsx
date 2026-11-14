import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhaseBadge, VerifyBadge } from "@/components/escrow/Badges";
import { ReleaseAction } from "@/components/escrow/ReleaseAction";
import { FACTORY, clock, factoryListings, human, row, view, type Origin } from "@/lib/encroe/directory";
import { ESCROW_CODE_SHA256, accessKeys, codeSha256, isEscrowId } from "@/lib/encroe/escrows";
import { packageUrl } from "@/lib/encroe/revive";
import POOL from "@/lib/encroe/pool.json";

type Run = {
  kind: string;
  requester: string;
  block_height: number;
  output_ok: boolean;
  t1: string | null;
  accepted: boolean;
  epoch: number;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id, description: `The Encroe escrow ${id}, read live from NEAR.` };
}

export default async function EscrowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isEscrowId(id)) notFound();
  const listing = id.endsWith(`.${FACTORY}`) ? (await factoryListings()).find((l) => l.escrow === id) : undefined;
  const origin: Origin = listing ? "factory" : POOL.includes(id) ? "pool" : "ours";
  const [r, runs, keys, code] = await Promise.all([
    row(id, origin, listing),
    view<Run[]>(id, "get_runs"),
    accessKeys(id),
    codeSha256(id),
  ]);
  if (!r.state || !r.status) notFound();
  const s = r.status;
  const st = r.state;
  const c = st.commitment;
  const t = clock(s);
  const lapsesAt = s.lapses_at_ns ? Number(BigInt(s.lapses_at_ns) / 1_000_000n) : 0;

  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <Link href="/escrows" className="font-mono text-xs text-ink-3 hover:text-ink">
        ← the directory
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">
            {r.catalog ? `${r.catalog.language} · ${r.catalog.genre}` : "an Encroe escrow"}
          </p>
          <h1 className="mt-3 font-display text-h1 font-black">
            {r.catalog?.game ?? listing?.game ?? c?.game ?? "Unsealed"}
          </h1>
          <p className="mt-2 font-mono text-sm break-all text-ink-2">{id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PhaseBadge phase={s.phase} />
          <VerifyBadge badge={s.badge} />
        </div>
      </div>
      <p
        className={`mt-6 font-display text-h2 font-black ${
          t.tone === "silent" ? "text-flare" : t.tone === "released" ? "text-ember" : "text-acid"
        }`}
      >
        {t.text[0].toUpperCase() + t.text.slice(1)}.
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <Panel title="Can anyone cheat it?">
          <Fact label="access keys" value={keys === null ? "unknown" : String(keys)} ok={keys === 0} />
          <Fact
            label="code"
            value={code ? `${code.slice(0, 12)}…${code === ESCROW_CODE_SHA256 ? " (the escrow build)" : ""}` : "none"}
            ok={code === ESCROW_CODE_SHA256}
          />
          <Fact label="studio (owner)" value={st.owner} />
          <Fact label="grace" value={human(Number(BigInt(s.grace_ns) / 1_000_000n))} />
          {listing && <Fact label="created by" value={`${listing.created_by}, via ${FACTORY}: never had a key`} ok />}
        </Panel>
        <Panel title="What is sealed">
          {c ? (
            <>
              <Fact label="epoch" value={`${c.epoch}, ${c.players} players`} />
              <Fact label="players' root" value={`${c.root.slice(0, 16)}…`} />
              <Fact label="server core" value={`${c.core_sha256.slice(0, 16)}…`} />
              <Fact label="MPC key path" value={st.path} />
              <a
                href={packageUrl(st.owner, id, c.pkg_sha256)}
                className="mt-2 inline-block font-mono text-xs text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                the sealed package, on FastFS
              </a>
            </>
          ) : (
            <p className="text-sm text-ink-3">
              Nothing sealed yet. The studio seals its first epoch with the CLI below.
            </p>
          )}
        </Panel>
        <Panel title="What anyone can do">
          {s.phase === "released" ? (
            <Link
              href={`/revive?escrow=${id}`}
              className="inline-flex rounded-md bg-ember px-5 py-3 font-display text-xs font-bold tracking-wide text-void uppercase"
            >
              Bring it back
            </Link>
          ) : s.release_condition_met ? (
            <ReleaseAction escrow={id} lapsesAt={lapsesAt} />
          ) : (
            <>
              <p className="text-sm text-ink-2">
                Its studio is alive, so nobody can release it. Try anyway, or check it is real.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/break"
                  className="rounded-md border-2 border-flare px-4 py-2 font-display text-xs font-bold text-flare uppercase"
                >
                  Try to break it
                </Link>
                {id === "encroe-embergate.testnet" && (
                  <Link
                    href="/play"
                    className="rounded-md bg-acid px-4 py-2 font-display text-xs font-bold text-void uppercase"
                  >
                    Check my items
                  </Link>
                )}
              </div>
            </>
          )}
          {s.released_by && <Fact label="released by" value={s.released_by} />}
        </Panel>
      </div>

      <section className="mt-10" aria-labelledby="runs">
        <h2 id="runs" className="font-display text-h2 font-black">
          Verification runs
        </h2>
        <p className="mt-2 text-sm text-ink-3">
          Each run is the pinned verifier inside an Intel TDX enclave; it counts once NEAR&rsquo;s DCAP verifier accepts
          its quote.
        </p>
        <ol className="mt-4 space-y-2">
          {(runs ?? []).map((run, i) => (
            <li
              key={i}
              className="grid gap-2 rounded-md border border-line bg-panel px-4 py-3 font-mono text-xs sm:grid-cols-[3rem_5rem_1fr_auto]"
            >
              <span className="text-ink-3">#{i}</span>
              <span>epoch {run.epoch}</span>
              <span className="truncate text-ink-3">
                asked by {run.requester} at block {run.block_height}
              </span>
              <span className={run.accepted ? "text-acid" : run.output_ok ? "text-gold" : "text-flare"}>
                {run.accepted ? `accepted · ${run.t1}` : run.output_ok ? "passed, awaiting quote" : "no pass"}
              </span>
            </li>
          ))}
          {!runs?.length && <li className="text-sm text-ink-3">No runs yet.</li>}
        </ol>
      </section>

      <section className="mt-10 rounded-xl border border-line bg-panel-2 p-6" aria-labelledby="studio">
        <h2 id="studio" className="font-display text-lg font-bold">
          For the studio
        </h2>
        <p className="mt-2 text-sm text-ink-2">Seal the next epoch from your live world, and keep the heartbeat:</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-night p-4 font-mono text-xs text-ink-2">
          {`ESCROW_ACCOUNT=${id} ESCROW_NAME=${st.path.split("/")[1]} \\
  ENCROE_GAME_URL=https://your.game scripts/studio/bot.sh seal
ESCROW_ACCOUNT=${id} ESCROW_NAME=${st.path.split("/")[1]} scripts/studio/bot.sh heartbeat`}
        </pre>
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-3 space-y-1.5">{children}</div>
    </section>
  );
}

function Fact({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <p className="font-mono text-xs break-words">
      <span className="text-ink-3">{label}: </span>
      <span className={ok === undefined ? "text-ink-2" : ok ? "text-acid" : "text-flare"}>
        {ok ? "✓ " : ok === false ? "✗ " : ""}
        {value}
      </span>
    </p>
  );
}
