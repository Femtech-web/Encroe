import type { Metadata } from "next";
import Link from "next/link";
import { BreakIt } from "@/components/break/BreakIt";
import { ATTACKS } from "@/lib/encroe/attacks";
import { ESCROW_CODE_SHA256, accessKeys, codeSha256 } from "@/lib/encroe/escrows";

export const metadata: Metadata = {
  title: "Try to break it",
  description:
    "Real attacks on live, locked Encroe escrows, sent from a stranger's account. Each one is refused on NEAR.",
};

const LIVE = "encroe-embergate.testnet";

export default async function BreakPage() {
  const [keys, code] = await Promise.all([accessKeys(LIVE), codeSha256(LIVE)]);
  const cards = ATTACKS.map(({ id, title, goal, escrow, method, expected }) => ({
    id,
    title,
    goal,
    escrow,
    method,
    expected,
  }));
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-flare uppercase">Try to break it</p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Cheat the escrow. <span className="text-flare">Live.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        Each button sends a real transaction from a stranger&rsquo;s account to a live, locked escrow on NEAR testnet.
        The contract is the only judge: no server of ours decides anything, and every answer links to its transaction.
      </p>

      <section className="mt-12" aria-label="Attacks">
        <BreakIt attacks={cards} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Attacks that need no transaction">
        <article className="rounded-xl border border-line bg-panel p-6">
          <p className="font-mono text-xs text-flare">attack 07</p>
          <h3 className="mt-2 font-display text-h2 font-black">Change the escrow&rsquo;s code</h3>
          <p className="mt-2 text-sm text-ink-2">
            Swap the contract for one that hands the key to the studio. A transaction that changes code must be signed
            by one of the account&rsquo;s keys, and it has none, so there is nothing to send. Read live from NEAR:
          </p>
          <dl className="mt-4 space-y-1 font-mono text-xs">
            <div>
              <dt className="inline text-ink-3">{LIVE} access keys: </dt>
              <dd className={`inline font-bold ${keys === 0 ? "text-acid" : "text-flare"}`}>{keys ?? "unknown"}</dd>
            </div>
            <div>
              <dt className="inline text-ink-3">code sha256: </dt>
              <dd className={`inline ${code === ESCROW_CODE_SHA256 ? "text-acid" : "text-flare"}`}>
                {code ? `${code.slice(0, 16)}…` : "unknown"}
                {code === ESCROW_CODE_SHA256 ? " (the published escrow build)" : ""}
              </dd>
            </div>
          </dl>
        </article>
        <article className="flex flex-col rounded-xl border border-line bg-panel p-6">
          <p className="font-mono text-xs text-flare">attack 08</p>
          <h3 className="mt-2 font-display text-h2 font-black">Hand players a doctored game</h3>
          <p className="mt-2 flex-1 text-sm text-ink-2">
            After a release, serve players a package with one byte changed. Your browser checks it against the hash NEAR
            holds before opening anything. This link flips a byte in the package it downloads:
          </p>
          <Link
            href="/revive?escrow=encroe-kill-beaa.testnet&tamper=1"
            className="mt-4 w-fit rounded-md border-2 border-flare px-5 py-2.5 font-display text-xs font-bold tracking-wide text-flare uppercase hover:bg-flare hover:text-void"
          >
            Try it in your browser
          </Link>
        </article>
      </section>
    </main>
  );
}
