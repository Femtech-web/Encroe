"use client";

import Link from "next/link";
import { useState } from "react";
import { ConnectNear } from "@/components/wallet/ConnectNear";
import { useNearAccount, useTx } from "@/lib/wallet/useNear";

const GRACES: [number, string][] = [
  [86400, "1 day"],
  [7 * 86400, "7 days"],
  [30 * 86400, "30 days"],
  [90 * 86400, "90 days"],
  [180 * 86400, "180 days"],
  [365 * 86400, "1 year"],
];
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;

/**
 * A studio's escrow, from its own wallet: one call to the factory, which creates `<name>.<factory>` with no access
 * key, the published escrow build, and this studio as its owner. The 5 NEAR pay the escrow's storage.
 */
export function CreateEscrow({ factory, live, nonce }: { factory: string; live: boolean; nonce?: string }) {
  const account = useNearAccount();
  const { state, run } = useTx();
  const [name, setName] = useState("");
  const [game, setGame] = useState("");
  const [grace, setGrace] = useState(30 * 86400);
  const [owner, setOwner] = useState("");
  const escrow = `${name || "your-game"}.${factory}`;
  const valid = NAME.test(name) && game.trim().length > 0;
  const studio = owner.trim() || account || "";

  async function create() {
    await run({
      receiverId: factory,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "create_escrow",
            args: { name, owner: studio, game: game.trim(), grace_s: grace },
            gas: (300n * 10n ** 12n).toString(),
            deposit: (5n * 10n ** 24n).toString(),
          },
        },
      ],
    });
  }

  return (
    <div className="rounded-xl border border-acid/40 bg-panel p-6 shadow-acid">
      <h2 className="font-display text-h2 font-black">Create your escrow</h2>
      <p className="mt-2 text-sm text-ink-2">
        One transaction from your wallet. The factory creates the account with no key at all, deploys the published
        escrow build, and makes you its studio.
      </p>
      <div className="mt-5">
        <ConnectNear nonce={nonce} />
      </div>
      <form
        className="mt-6 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && account) void create();
        }}
      >
        <Field label="Escrow name" hint={`becomes ${escrow}`}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            maxLength={32}
            placeholder="your-game"
            className="w-full rounded-md border border-line-strong bg-night px-3 py-2.5 font-mono text-sm outline-none focus:border-acid"
          />
        </Field>
        <Field label="Game" hint="as players know it">
          <input
            value={game}
            onChange={(e) => setGame(e.target.value)}
            maxLength={64}
            placeholder="Your Game"
            className="w-full rounded-md border border-line-strong bg-night px-3 py-2.5 text-sm outline-none focus:border-acid"
          />
        </Field>
        <Field label="Grace period" hint="how long a silence it takes before anyone may release your game">
          <select
            value={grace}
            onChange={(e) => setGrace(Number(e.target.value))}
            className="w-full rounded-md border border-line-strong bg-night px-3 py-2.5 text-sm"
          >
            {GRACES.map(([s, label]) => (
              <option key={s} value={s}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Studio account" hint="signs heartbeats and seals; defaults to the wallet you connect">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value.trim())}
            placeholder={account ?? "studio.testnet"}
            className="w-full rounded-md border border-line-strong bg-night px-3 py-2.5 font-mono text-sm outline-none focus:border-acid"
          />
        </Field>
        <button
          disabled={!live || !account || !valid || state.kind === "signing"}
          className="mt-2 w-fit rounded-md bg-acid px-6 py-3.5 font-display text-sm font-bold tracking-wide text-void uppercase transition hover:shadow-acid disabled:opacity-40"
        >
          {state.kind === "signing" ? "Waiting for your wallet…" : "Create it · 5 NEAR"}
        </button>
        {!live && (
          <p className="text-sm text-gold">The factory is being deployed to testnet; this form opens with it.</p>
        )}
      </form>
      {state.kind === "done" && (
        <p className="mt-4 animate-rise text-sm text-acid">
          Created.{" "}
          <Link href={`/escrow/${escrow}`} className="underline underline-offset-4">
            Open {escrow}
          </Link>
          {state.hash && (
            <>
              {" · "}
              <a href={`https://testnet.nearblocks.io/txns/${state.hash}`} className="underline underline-offset-4">
                the transaction
              </a>
            </>
          )}
        </p>
      )}
      {state.kind === "refused" && (
        <p role="alert" className="mt-4 text-sm text-flare">
          {state.reason}
        </p>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      {children}
      <span className="font-mono text-[11px] text-ink-3">{hint}</span>
    </label>
  );
}
