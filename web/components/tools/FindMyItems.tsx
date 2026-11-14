"use client";

import { hexToBytes } from "@noble/hashes/utils.js";
import { useState } from "react";
import { CATALOGS } from "@/lib/cores/catalog";
import { publicKeyOf } from "@/lib/game/moves";
import { NotReleased, revive } from "@/lib/encroe/revive";

/**
 * A player's items in a released game, found from public data with their own key backup: the browser brings the
 * world back (every check) and looks for the key. The key file never leaves the browser.
 */
export function FindMyItems() {
  const [escrow, setEscrow] = useState("encroe-kill-beaa.testnet");
  const [pk, setPk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ text: string; ok: boolean; items?: string[] } | null>(null);

  async function find() {
    if (!pk) return;
    setBusy(true);
    setFound(null);
    try {
      const r = await revive(escrow.trim(), () => undefined);
      const catalog = CATALOGS[r.state.commitment!.core_sha256];
      const me = r.pkg.players.find((p) => p.pk === pk);
      setFound(
        me
          ? {
              ok: true,
              text: `Your key is in ${catalog?.game ?? r.pkg.game}, epoch ${r.pkg.epoch}:`,
              items: me.items.map(([id, q]) => `${q} × ${catalog?.items[id] ?? `item ${id}`}`),
            }
          : { ok: false, text: `Not in this world: its ${r.pkg.players.length} players hold other keys.` },
      );
    } catch (e) {
      setFound({ ok: false, text: e instanceof NotReleased ? e.message : (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <label className="grid gap-1.5 text-sm font-bold">
          The released game&rsquo;s escrow
          <input
            value={escrow}
            onChange={(e) => setEscrow(e.target.value)}
            spellCheck={false}
            className="rounded-md border border-line-strong bg-night px-3 py-2.5 font-mono text-sm font-normal outline-none focus:border-acid"
          />
        </label>
        <label className="cursor-pointer rounded-md border border-dashed border-line-strong px-3 py-3 text-sm text-ink-2 hover:border-acid">
          {pk ? `Key ${pk.slice(0, 12)}… loaded` : "Choose your key backup (embergate-key-*.json)"}
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const { secret_key } = JSON.parse(await f.text()) as { secret_key?: string };
                setPk(secret_key && /^[0-9a-f]{64}$/.test(secret_key) ? publicKeyOf(hexToBytes(secret_key)) : null);
              } catch {
                setPk(null);
              }
            }}
          />
        </label>
        <button
          disabled={!pk || busy}
          className="w-fit rounded-md bg-acid px-5 py-3 font-display text-xs font-bold tracking-wide text-void uppercase disabled:opacity-40"
        >
          {busy ? "Bringing the world back…" : "Find my items"}
        </button>
      </form>
      <div role="status" aria-live="polite">
        {found && (
          <div className="rounded-xl border border-line bg-panel p-5">
            <p className={`font-display font-bold ${found.ok ? "text-acid" : "text-ink-2"}`}>{found.text}</p>
            {found.items && (
              <ul className="mt-3 space-y-1 font-mono text-sm">
                {found.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
