"use client";

import { useEffect, useState } from "react";
import { viewStatus } from "@/lib/game/near";

type Phase =
  { kind: "idle" } | { kind: "sending" } | { kind: "waiting"; tx?: string } | { kind: "failed"; reason: string };

/**
 * The studio is silent, or about to be: anyone may release its escrow. The site pays the gas from a throwaway
 * account; the contract alone decides, and this panel waits for NEAR to show the key published.
 */
export function ReleasePanel({
  escrow,
  lapsesAt,
  onReleased,
}: {
  escrow: string;
  lapsesAt: number;
  onReleased: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const silent = now >= lapsesAt;

  useEffect(() => {
    if (silent) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [silent]);

  useEffect(() => {
    if (phase.kind !== "waiting") return;
    let stop = false;
    const started = Date.now();
    (async () => {
      while (!stop && Date.now() - started < 180_000) {
        const s = await viewStatus(escrow).catch(() => null);
        if (s?.phase === "released") return onReleased();
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!stop)
        setPhase({ kind: "failed", reason: "NEAR has not shown the release yet; try Bring it back again shortly." });
    })();
    return () => {
      stop = true;
    };
  }, [phase.kind, escrow, onReleased]);

  async function release() {
    setPhase({ kind: "sending" });
    const res = await fetch("/api/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ escrow }),
    });
    const body = (await res.json()) as { tx?: string; error?: string };
    if (res.ok) setPhase({ kind: "waiting", tx: body.tx });
    else if (body.error === "already released") setPhase({ kind: "waiting" });
    else setPhase({ kind: "failed", reason: body.error ?? `HTTP ${res.status}` });
  }

  const left = Math.max(0, Math.ceil((lapsesAt - now) / 1000));
  return (
    <div className="animate-rise rounded-xl border border-flare/50 bg-flare-soft p-6">
      <p className="font-mono text-xs tracking-[0.3em] text-flare uppercase">
        {silent ? "The studio is silent" : "The studio's heartbeat holds"}
      </p>
      <p className="mt-3 font-display text-h2 font-black">
        {silent
          ? "Anyone may release it now."
          : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} until it lapses`}
      </p>
      <p className="mt-3 text-sm text-ink-2">
        The contract has no keys and no owner who can stop this: once the heartbeat lapses, its{" "}
        <span className="font-mono">release</span> is open to everyone. We only pay the gas.
      </p>
      <button
        onClick={release}
        disabled={!silent || phase.kind === "sending" || phase.kind === "waiting"}
        className="mt-5 rounded-md bg-flare px-6 py-3.5 font-display text-sm font-bold tracking-wide text-void uppercase transition disabled:opacity-40"
      >
        {phase.kind === "sending" ? "Sending…" : phase.kind === "waiting" ? "NEAR is releasing the key…" : "Release it"}
      </button>
      {phase.kind === "waiting" && phase.tx && (
        <p className="mt-3 font-mono text-xs text-ink-2">
          release{" "}
          <a
            className="underline underline-offset-4 hover:text-ink"
            href={`https://testnet.nearblocks.io/txns/${phase.tx}`}
            target="_blank"
            rel="noreferrer"
          >
            {phase.tx.slice(0, 10)}…
          </a>{" "}
          sent; waiting for NEAR&rsquo;s MPC network to publish the key
        </p>
      )}
      {phase.kind === "failed" && <p className="mt-3 text-sm text-flare">{phase.reason}</p>}
    </div>
  );
}
