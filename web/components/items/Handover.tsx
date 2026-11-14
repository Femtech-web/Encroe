"use client";

import { useState } from "react";
import {
  claimFor,
  isEvmAddress,
  ITEMS_CHAIN,
  ITEMS_CONTRACT,
  ITEMS_TOKEN,
  relayCommand,
  type SignedClaim,
} from "@/lib/encroe/items";
import type { PackagePlayer } from "@/lib/encroe/release";
import { loadKey } from "@/lib/game/client";
import { publicKeyOf } from "@/lib/game/moves";
import { viewCall } from "@/lib/game/near";

type Step =
  | { kind: "idle" }
  | { kind: "busy"; note: string }
  | { kind: "signed"; claim: SignedClaim }
  | { kind: "failed"; note: string };

/**
 * A released world's items, taken to Base Sepolia: this browser's game key signs the claim, the site's relayer pays
 * NEAR's gas, encroe-items checks it against the escrow's committed root, and NEAR's MPC network signs it for
 * EncroeItems. Only the player whose key is sealed in the world can claim, and only once.
 */
export function Handover({
  escrow,
  game,
  epoch,
  players,
}: {
  escrow: string;
  game: string;
  epoch: number;
  players: PackagePlayer[];
}) {
  const [sk] = useState(() => loadKey());
  const pk = sk ? publicKeyOf(sk) : null;
  const sealed = pk ? players.find((p) => p.pk === pk) : undefined;
  const [to, setTo] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });

  async function take() {
    if (!sk || !pk || !isEvmAddress(to)) return;
    const claim = claimFor(escrow, game, epoch, players, pk, sk, to);
    if (!claim) return;
    try {
      const already = await viewCall<SignedClaim | "pending" | null>(ITEMS_CONTRACT, "get_claim", {
        escrow,
        player: pk,
      });
      if (!already) {
        setStep({ kind: "busy", note: "checking your items against the root on NEAR…" });
        const res = await fetch("/api/items/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(claim),
        });
        const out = (await res.json()) as { refusal?: string; error?: string };
        if (!res.ok) throw new Error(out.refusal ?? out.error ?? `HTTP ${res.status}`);
      }
      setStep({ kind: "busy", note: "NEAR's MPC network is signing your claim…" });
      for (let i = 0; i < 40; i++) {
        const got = await viewCall<SignedClaim | "pending" | null>(ITEMS_CONTRACT, "get_claim", { escrow, player: pk });
        if (got && got !== "pending") return setStep({ kind: "signed", claim: got });
        if (got === null && i > 0)
          throw new Error("encroe-items refused the claim: these items are not in the sealed world");
        await new Promise((r) => setTimeout(r, 3000));
      }
      throw new Error("no signature yet; check again in a minute");
    } catch (e) {
      setStep({ kind: "failed", note: (e as Error).message });
    }
  }

  return (
    <section aria-labelledby="handover" className="mt-10 min-w-0 rounded-xl border border-gold/40 bg-panel p-6">
      <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">NEAR Chain Signatures</p>
      <h2 id="handover" className="mt-3 font-display text-h2 font-black">
        Take your items to {ITEMS_CHAIN.name}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-2">
        What you earned can leave the game. NEAR checks your items are in the sealed world and signs a claim with a key
        no one holds; a token contract on {ITEMS_CHAIN.name} mints exactly those items to your address, once.
      </p>
      {!sealed ? (
        <p className="mt-4 text-sm text-ink-3">
          Only players sealed into this world can take their items out, and this browser&apos;s game key is not among
          them.
        </p>
      ) : (
        <>
          <p className="mt-4 font-mono text-xs text-ink-2">
            your items: {sealed.items.map(([id, q]) => `${q}× #${id}`).join(", ")}
          </p>
          <form
            className="mt-4 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void take();
            }}
          >
            <input
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder="0x… your address on Base Sepolia"
              aria-label="Your EVM address"
              className="min-w-72 flex-1 rounded-md border border-line-strong bg-night px-3 py-2.5 font-mono text-sm outline-none focus:border-gold"
            />
            <button
              disabled={!isEvmAddress(to) || step.kind === "busy"}
              className="rounded-md bg-gold px-5 py-2.5 font-display text-sm font-bold tracking-wide text-void uppercase disabled:opacity-40"
            >
              Claim my items
            </button>
          </form>
        </>
      )}
      {step.kind === "busy" && <p className="mt-4 text-sm text-gold">{step.note}</p>}
      {step.kind === "failed" && (
        <p role="alert" className="mt-4 text-sm text-flare">
          {step.note}
        </p>
      )}
      {step.kind === "signed" && (
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-acid">
            Signed by NEAR&apos;s MPC network. Anyone can relay it to{" "}
            <a href={`${ITEMS_CHAIN.explorer}/address/${ITEMS_TOKEN}`} className="underline underline-offset-4">
              EncroeItems
            </a>
            ; it mints to {step.claim.claim.to} and nowhere else.
          </p>
          <pre className="rounded-md bg-night p-3 font-mono text-[11px] break-all whitespace-pre-wrap text-ink-2">
            {relayCommand(step.claim)}
          </pre>
        </div>
      )}
    </section>
  );
}
