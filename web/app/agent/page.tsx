import type { Metadata } from "next";
import Link from "next/link";
import { SweepButton } from "@/components/agent/SweepButton";
import { log, reports, watchList } from "@/lib/encroe/agent";
import { REPO } from "@/lib/encroe/escrows";

export const metadata: Metadata = {
  title: "The preservation agent",
  description:
    "An agent that watches every game escrow, releases a silent studio's game, and brings it back with every check. Also an MCP server for yours.",
};

const MCP = "claude mcp add --transport http encroe https://encroe.vercel.app/api/mcp";

export default async function AgentPage() {
  const [actions, revived, watched] = await Promise.all([log(), reports(), watchList()]);
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-acid uppercase">The preservation agent</p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Nobody has to <span className="text-acid">remember.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        An agent watches every escrow. When a studio goes silent past its grace period, it releases the game, which
        anyone may do. When a game is released, it brings it back from NEAR and FastFS alone, runs every check, and
        keeps the report here. It holds no key that matters and asks nobody&rsquo;s permission.
      </p>
      <p className="mt-3 max-w-2xl text-sm text-ink-3">
        Any AI can do the same through this site&rsquo;s MCP server. Claude Code, unmodified and given nothing else,
        found a silent studio, checked its escrow, released it and brought the game back with all 8 checks in 48
        seconds.{" "}
        <a
          href={`${REPO}/blob/main/docs/results/agent-runs/README.md`}
          className="text-acid underline underline-offset-4"
        >
          The run, with its transcript
        </a>
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <SweepButton />
        <span className="font-mono text-xs text-ink-3">
          watching {watched.length} escrows · also runs every 30 minutes on its own
        </span>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="revived">
          <h2 id="revived" className="font-display text-h2 font-black">
            Games it brought back
          </h2>
          <ul className="mt-4 space-y-3">
            {revived.map((r) => (
              <li key={`${r.escrow}-${r.at}`} className="rounded-lg border border-line bg-panel p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display font-bold">
                    {r.game}
                    {r.language && <span className="ml-2 font-mono text-xs text-gold">{r.language}</span>}
                  </p>
                  <span className={`font-mono text-xs ${r.ok ? "text-acid" : "text-flare"}`}>
                    {r.ok ? `${r.steps.length}/8 checks` : "failed"}
                  </span>
                </div>
                <Link href={`/escrow/${r.escrow}`} className="mt-1 block font-mono text-xs text-ink-3 hover:text-ink">
                  {r.escrow}
                </Link>
                {r.ok && (
                  <p className="mt-2 text-sm text-ink-2">
                    Epoch {r.epoch}: {r.players} players and {r.items} items, every one where the escrow said it would
                    be.
                  </p>
                )}
                {r.error && <p className="mt-2 text-sm text-flare">{r.error}</p>}
              </li>
            ))}
            {!revived.length && <li className="text-sm text-ink-3">Nothing released yet.</li>}
          </ul>
        </section>

        <section aria-labelledby="log">
          <h2 id="log" className="font-display text-h2 font-black">
            Its log
          </h2>
          <ol className="mt-4 space-y-2">
            {actions.slice(0, 15).map((a, i) => (
              <li key={i} className="rounded-md border border-line bg-panel px-4 py-3 text-sm">
                <p className="font-mono text-[11px] text-ink-3">
                  {new Date(a.at).toUTCString()} · {a.did}
                </p>
                <p className="mt-1 text-ink-2">
                  {a.escrow !== "*" && <span className="font-mono text-xs">{a.escrow}: </span>}
                  {a.note}
                  {a.tx && (
                    <a
                      href={`https://testnet.nearblocks.io/txns/${a.tx}`}
                      className="ml-1 underline underline-offset-4"
                    >
                      tx
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-16 rounded-xl border border-gold/40 bg-panel p-6" aria-labelledby="yours">
        <h2 id="yours" className="font-display text-h2 font-black">
          Or run your own, from any AI
        </h2>
        <p className="mt-2 max-w-2xl text-ink-2">
          The same tools, as an MCP server: list escrows, inspect one, release a silent studio&rsquo;s game, bring a
          released game back with every check, and find a player&rsquo;s items in it.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md bg-night p-4 font-mono text-xs text-gold">{MCP}</pre>
      </section>
    </main>
  );
}
