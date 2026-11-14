import type { Metadata } from "next";
import Link from "next/link";
import { PhaseBadge, VerifyBadge } from "@/components/escrow/Badges";
import { CORE_RUNS, REPO, liveEscrows } from "@/lib/encroe/escrows";
import { viewStatus } from "@/lib/game/near";

export const metadata: Metadata = {
  title: "Proof",
  description:
    "The evidence behind Encroe: every recorded run on NEAR testnet, the attacks it refuses, the five languages, the item handover, an AI agent's run, and the experiments that came first.",
};

const doc = (p: string) => `${REPO}/blob/main/${p}`;

const EXPERIMENTS = [
  ["E1", "The key exists only in NEAR's MPC network, and is released publicly once the studio's heartbeat lapses"],
  [
    "E2",
    "Only the pinned verifier, run through the contract, can read the studio's secret: a thief build and a direct call were refused",
  ],
  ["E3", "The enclave's TDX quote verifies against Intel's collateral, bound to the exact input and output"],
  [
    "T1",
    "The contract accepts a run only after NEAR's own DCAP verifier checks its quote; a replayed quote is refused",
  ],
];

/** The evidence, kept apart from the product: what was run, what was refused, and how to check each claim. */
export default async function ProofPage() {
  const [runs, cores] = await Promise.all([
    liveEscrows(),
    Promise.all(CORE_RUNS.map((c) => viewStatus(c.escrow).catch(() => null))),
  ]);
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-acid uppercase">Proof</p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Don&rsquo;t take our word. <span className="text-acid">Take NEAR&rsquo;s.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        Every claim Encroe makes was run on NEAR testnet and written up with its transactions. Where a run simulated
        something (a studio going silent, scripted players), its write-up says so.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          href="/break"
          tone="text-flare"
          title="Try to break it"
          body="Six real attacks on live, locked escrows. Each refused on chain, in the contract's own words."
        />
        <Card
          href="/judges"
          tone="text-acid"
          title="The judges' path"
          body="Five minutes: play, check the vault, kill a studio, bring it back, play on."
        />
        <Card
          href="/agent"
          tone="text-ember"
          title="The agent's record"
          body="Every game it brought back, with all eight checks, every 30 minutes."
        />
        <Card
          href={doc("docs/results/agent-runs/README.md")}
          tone="text-ember"
          title="An AI agent did it"
          body="Claude Code, unmodified, with only our MCP server: it released a silent studio's game and brought it back, all 8 checks, in 48 s."
        />
        <Card
          href={doc("docs/results/items/README.md")}
          tone="text-gold"
          title="Items on another chain"
          body="A released world's items minted on Base Sepolia through NEAR Chain Signatures; forged, inflated and repeated claims refused."
        />
        <Card
          href={doc("docs/attacks.md")}
          tone="text-flare"
          title="Every attack, and its cost"
          body="Each way to cheat Encroe we tried, what stopped it, and where the refusal is recorded."
        />
      </div>

      <section className="mt-20" aria-labelledby="runs">
        <h2 id="runs" className="font-display text-h1 font-black">
          Every run, on chain
        </h2>
        <ul className="mt-6 space-y-3">
          {runs.map((r) => (
            <li
              key={r.id}
              className="grid gap-3 rounded-lg border border-line bg-panel p-5 md:grid-cols-[1.2fr_2fr_auto] md:items-center"
            >
              <Link href={`/escrow/${r.id}`} className="truncate font-mono text-sm hover:text-acid">
                {r.id}
              </Link>
              <p className="text-sm text-ink-2">{r.story}</p>
              <div className="flex flex-wrap items-center gap-2">
                {r.status && <PhaseBadge phase={r.status.phase} />}
                {r.status && <VerifyBadge badge={r.status.badge} />}
                <a
                  href={`${REPO}/tree/main/docs/results/escrow/${r.results}`}
                  className="text-xs text-ink-2 underline underline-offset-4"
                >
                  the write-up
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20" aria-labelledby="langs">
        <h2 id="langs" className="font-display text-h1 font-black">
          Five languages, one verifier
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {CORE_RUNS.map((c, i) => (
            <Link
              key={c.game}
              href={`/escrow/${c.escrow}`}
              className="rounded-xl border border-line bg-panel p-5 hover:border-line-strong"
            >
              <p className="font-display text-4xl font-black text-gold">{c.language}</p>
              <p className="mt-2 font-display font-bold">{c.game}</p>
              <p className="mt-1 font-mono text-xs text-ink-3">core {c.sha256.slice(0, 12)}…</p>
              <p className="mt-2 font-mono text-xs text-acid">
                {cores[i] ? `${cores[i]!.phase} · ${cores[i]!.badge}` : "unknown"}
              </p>
            </Link>
          ))}
        </div>
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href={doc("docs/results/escrow/cores/README.md")} className="text-gold underline underline-offset-4">
            Rust, C++ and C: sealed, released, revived
          </a>
          <a href={doc("docs/results/escrow/engines/README.md")} className="text-gold underline underline-offset-4">
            Zig and Go: sealed, verified green
          </a>
        </p>
      </section>

      <section className="mt-20" aria-labelledby="first">
        <h2 id="first" className="font-display text-h1 font-black">
          Before any of this
        </h2>
        <p className="mt-3 max-w-2xl text-ink-2">
          Four go/no-go experiments decided whether Encroe could exist at all. All four passed on testnet.
        </p>
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {EXPERIMENTS.map(([id, claim]) => (
            <li key={id} className="flex gap-4 rounded-lg border border-line bg-panel p-5">
              <span className="font-display text-2xl font-black text-acid">{id}</span>
              <span className="text-sm text-ink-2">{claim}</span>
            </li>
          ))}
        </ul>
        <a href={doc("GO_NO_GO.md")} className="mt-4 inline-block text-sm text-acid underline underline-offset-4">
          GO_NO_GO.md
        </a>
      </section>

      <section className="mt-20 grid gap-4 md:grid-cols-2" aria-label="Trust and threats">
        <Card
          href={doc("docs/trust.md")}
          tone="text-gold"
          title="What you trust"
          body="Each part of Encroe, what you have to trust about it, and how to check it yourself."
        />
        <Card
          href={doc("docs/threat-model.md")}
          tone="text-flare"
          title="The threat model"
          body="Who could cheat, how, and what stops them; and what is out of scope."
        />
      </section>
    </main>
  );
}

function Card({ href, tone, title, body }: { href: string; tone: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-panel p-6 transition hover:border-line-strong">
      <h2 className={`font-display text-h2 font-black ${tone}`}>{title} →</h2>
      <p className="mt-2 text-sm text-ink-2">{body}</p>
    </Link>
  );
}
