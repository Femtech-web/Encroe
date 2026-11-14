"use client";

import { useState } from "react";
import { ConnectNear } from "@/components/wallet/ConnectNear";
import { useNearAccount, useTx } from "@/lib/wallet/useNear";

const NOTICES: [number, string][] = [
  [7 * 86400, "7 days"],
  [30 * 86400, "30 days"],
  [90 * 86400, "90 days"],
];

const call = (escrow: string, methodName: string, args: Record<string, unknown>) => ({
  receiverId: escrow,
  actions: [
    { type: "FunctionCall" as const, params: { methodName, args, gas: (30n * 10n ** 12n).toString(), deposit: "0" } },
  ],
});

/**
 * The studio's own controls, signed by its wallet: the heartbeat that keeps its game, and the end of life that
 * hands it over after a notice period. The escrow refuses both from anyone but its owner.
 */
export function StudioConsole({ escrow, owner, nonce }: { escrow: string; owner: string; nonce?: string }) {
  const account = useNearAccount();
  const { state, run } = useTx();
  const [notice, setNotice] = useState(NOTICES[1][0]);
  const isStudio = account === owner;
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-6" aria-labelledby="console">
      <h2 id="console" className="font-display text-lg font-bold">
        Studio console
      </h2>
      <p className="mt-2 text-sm text-ink-2">
        For <span className="font-mono text-xs">{owner}</span>: send your heartbeat, or end your game&rsquo;s service
        and hand it to its players after a notice period. Signed by your wallet; nobody else can.
      </p>
      <div className="mt-4">
        <ConnectNear nonce={nonce} />
      </div>
      {account && !isStudio && (
        <p className="mt-3 text-sm text-ink-3">
          This wallet is not this escrow&rsquo;s studio: the escrow would refuse it.
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          disabled={!isStudio || state.kind === "signing"}
          onClick={() => run(call(escrow, "heartbeat", {}))}
          className="rounded-md bg-acid px-5 py-3 font-display text-xs font-bold tracking-wide text-void uppercase disabled:opacity-40"
        >
          Send heartbeat
        </button>
        <span className="flex items-center gap-2">
          <select
            value={notice}
            onChange={(e) => setNotice(Number(e.target.value))}
            aria-label="Notice period"
            className="rounded-sm border border-line bg-night px-2 py-2 text-sm"
          >
            {NOTICES.map(([s, l]) => (
              <option key={s} value={s}>
                {l} notice
              </option>
            ))}
          </select>
          <button
            disabled={!isStudio || state.kind === "signing"}
            onClick={() => {
              if (confirm("End this game's service? After the notice period anyone may release it to its players."))
                void run(call(escrow, "declare_end_of_life", { notice_ns: notice * 1_000_000_000 }));
            }}
            className="rounded-md border-2 border-flare px-5 py-2.5 font-display text-xs font-bold tracking-wide text-flare uppercase disabled:opacity-40"
          >
            Declare end of life
          </button>
        </span>
      </div>
      {state.kind === "done" && (
        <p className="mt-3 text-sm text-acid">Done{state.hash ? `: ${state.hash.slice(0, 12)}…` : "."}</p>
      )}
      {state.kind === "refused" && (
        <p role="alert" className="mt-3 text-sm text-flare">
          {state.reason}
        </p>
      )}
    </section>
  );
}
