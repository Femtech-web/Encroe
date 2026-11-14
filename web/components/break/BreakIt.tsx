"use client";

import { useState } from "react";

type Card = { id: string; title: string; goal: string; escrow: string; method: string; expected: string };
type Result = { tx?: string; reason?: string | null; held?: boolean; error?: string; reused?: boolean; at?: string };

/** Each card sends its attack for real and shows the escrow's answer, with the transaction to check it by. */
export function BreakIt({ attacks }: { attacks: Card[] }) {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/break", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attack: id }),
      });
      const body = (await res.json()) as Result;
      setResults((r) => ({ ...r, [id]: body }));
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { error: (e as Error).message } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {attacks.map((a, i) => {
        const r = results[a.id];
        return (
          <article key={a.id} className="flex flex-col rounded-xl border border-line bg-panel p-6">
            <p className="font-mono text-xs text-flare">attack {String(i + 1).padStart(2, "0")}</p>
            <h3 className="mt-2 font-display text-h2 font-black">{a.title}</h3>
            <p className="mt-2 flex-1 text-sm text-ink-2">{a.goal}</p>
            <p className="mt-4 font-mono text-[11px] text-ink-3">
              {a.method}() on {a.escrow}
            </p>
            <button
              onClick={() => run(a.id)}
              disabled={busy !== null}
              aria-label={`Try it: ${a.title}`}
              className="mt-4 w-fit rounded-md bg-flare px-5 py-2.5 font-display text-xs font-bold tracking-wide text-void uppercase transition hover:shadow-ember disabled:opacity-40"
            >
              {busy === a.id ? "Sending to NEAR…" : "Try it"}
            </button>
            {r && (
              <div
                role="status"
                className={`mt-4 animate-rise rounded-md border p-3 text-sm ${
                  r.error
                    ? "border-line text-ink-2"
                    : r.held
                      ? "border-acid/40 bg-acid-soft"
                      : "border-flare/50 bg-flare-soft"
                }`}
              >
                {r.error ? (
                  r.error
                ) : (
                  <>
                    <p className={`font-display font-bold ${r.held ? "text-acid" : "text-flare"}`}>
                      {r.held ? "Refused by the escrow" : "Unexpected answer"}
                    </p>
                    <p className="mt-1 font-mono text-xs break-words text-ink-2">&ldquo;{r.reason}&rdquo;</p>
                    {r.tx && (
                      <a
                        href={`https://testnet.nearblocks.io/txns/${r.tx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block font-mono text-xs text-ink-3 underline underline-offset-4 hover:text-ink"
                      >
                        the transaction: {r.tx.slice(0, 12)}…{r.reused ? " (shared with a click seconds ago)" : ""}
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
