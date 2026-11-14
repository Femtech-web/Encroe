"use client";

import { useState } from "react";
import { send } from "@/lib/game/client";
import type { GameId } from "@/lib/game/games";
import { ITEMS, type ItemId } from "@/lib/game/items";
import { viewStatus, type EscrowStatus } from "@/lib/game/near";
import { playerLeaf, rootFromPath } from "@/lib/game/proof";
import type { ProofEntry, Sealed } from "@/lib/game/server";
import { Glyph } from "./Glyph";

type Check = { label: string; ok: boolean; detail: string };
type Result = { status: EscrowStatus; entry: ProofEntry; escrow: string; checks: Check[] };

const BADGE: Record<EscrowStatus["badge"], { text: string; tone: string }> = {
  green: { text: "Verified by a NEAR-checked enclave", tone: "text-acid" },
  "awaiting-proof": { text: "Enclave passed, awaiting NEAR's quote check", tone: "text-gold" },
  pending: { text: "Verification running", tone: "text-gold" },
  unverified: { text: "Not verified yet", tone: "text-ink-3" },
  unsealed: { text: "Nothing sealed", tone: "text-ink-3" },
  red: { text: "The sealed build failed verification", tone: "text-flare" },
};

/**
 * "Are my items really in there?" The game hands over this player's proof; the browser reads the root from NEAR
 * itself and recomputes the path. Nothing here takes the server's word.
 */
export function SealCheck({ sk, game = "embergate" }: { sk: Uint8Array; game?: GameId }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const { epoch, entry } = await send<{ epoch: Omit<Sealed, "players">; entry: ProofEntry }>(
        sk,
        { kind: "proof" },
        game === "embergate" ? "/api/proof" : `/api/games/${game}/proof`,
        game,
      );
      const status = await viewStatus(epoch.escrow);
      // NEAR holds only the newest epoch's root: a proof for an older one cannot be checked against it.
      if (status.epoch !== epoch.epoch) {
        setError(
          `The studio has sealed epoch ${status.epoch} since your proof (epoch ${epoch.epoch}). Your proof for it arrives as soon as the studio hands it over; check again shortly.`,
        );
        return;
      }
      const leaf = playerLeaf(status.game ?? "", status.epoch ?? 0, entry.pk, entry.items, entry.salt);
      const root = rootFromPath(leaf, entry.path);
      setResult({
        status,
        entry,
        escrow: epoch.escrow,
        checks: [
          {
            label: "Your leaf",
            ok: leaf === entry.leaf,
            detail: `${leaf.slice(0, 16)}… from your key, items and salt`,
          },
          { label: "Your path", ok: true, detail: `${entry.path.length} hashes up to a root` },
          {
            label: "NEAR's root",
            ok: root === status.root && status.epoch === epoch.epoch,
            detail: `${(status.root ?? "none").slice(0, 16)}… read from ${epoch.escrow}, epoch ${status.epoch}`,
          },
        ],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inside = result?.checks.every((c) => c.ok);
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold">Is my stuff in the vault?</h3>
          <p className="mt-1 text-sm text-ink-3">Your browser checks your items against the root NEAR holds.</p>
        </div>
        <button
          onClick={check}
          disabled={busy}
          className="shrink-0 rounded-md border border-acid/60 px-4 py-2 font-display text-xs font-bold tracking-wide text-acid uppercase transition hover:bg-acid-soft disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-ink-2">{error}</p>}
      {result && (
        <div className="mt-5 animate-rise space-y-3">
          <p className={`font-display text-sm font-bold ${inside ? "text-acid" : "text-flare"}`}>
            {inside ? `Sealed: your items as of epoch ${result.status.epoch}` : "These items are NOT in NEAR's root"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {result.entry.items.map(([id, q]) => (
              <li key={id} className="flex items-center gap-1.5 rounded-sm bg-night px-2 py-1 font-mono text-xs">
                <Glyph id={id} size={14} />
                {q} {ITEMS[id as ItemId]?.name ?? `#${id}`}
              </li>
            ))}
          </ul>
          <ol className="space-y-1.5 font-mono text-xs">
            {result.checks.map((c) => (
              <li key={c.label} className="flex gap-2">
                <span className={`shrink-0 ${c.ok ? "text-acid" : "text-flare"}`}>{c.ok ? "✓" : "✗"}</span>
                <span className="shrink-0 text-ink-2">{c.label}:</span>
                <span className="truncate text-ink-3">{c.detail}</span>
              </li>
            ))}
          </ol>
          <p className={`text-xs ${BADGE[result.status.badge].tone}`}>
            Escrow {result.status.phase} · {BADGE[result.status.badge].text} ·{" "}
            <a
              className="underline decoration-line-strong underline-offset-4 hover:text-ink"
              href={`https://testnet.nearblocks.io/address/${result.escrow}`}
              target="_blank"
              rel="noreferrer"
            >
              see it on NEAR
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
