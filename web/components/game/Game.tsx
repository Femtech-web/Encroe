"use client";

import { bytesToHex } from "@noble/hashes/utils.js";
import { useCallback, useEffect, useState } from "react";
import { forgetKey, loadKey, saveKey, saveName, type Me } from "@/lib/game/client";
import { ITEMS, NODES, RECIPES, canForge, qtyOf, renown, title, type ItemId, type Items } from "@/lib/game/items";
import { newSecretKey, publicKeyOf } from "@/lib/game/moves";
import { SERVER, type Transport, type WorldView } from "@/lib/game/transport";
import { Gate } from "./Gate";
import { Glyph } from "./Glyph";
import { SealCheck } from "./SealCheck";

/**
 * Rendered in the browser only: the player's key is read from this browser's storage. The same game runs against
 * the studio's server or, once revived from its escrow, against the core in this browser.
 */
export function Game({ transport = SERVER }: { transport?: Transport }) {
  const [sk, setSk] = useState<Uint8Array | null>(loadKey);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(() => sk === null);
  const [world, setWorld] = useState<WorldView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "no" } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const pk = sk ? publicKeyOf(sk) : null;

  useEffect(() => {
    if (!pk || loaded) return;
    transport
      .me(pk)
      .then((m) => {
        setMe(m);
        if (!m) setNotice({ text: "This key has no player in this world yet.", tone: "no" });
      })
      .catch(() => setNotice({ text: "Could not reach the world.", tone: "no" }))
      .finally(() => setLoaded(true));
  }, [pk, loaded, transport]);

  const refresh = useCallback(() => {
    transport
      .world()
      .then(setWorld)
      .catch(() => undefined);
  }, [transport]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const cooling = me ? me.next_gather_at > now : false;
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [cooling]);

  async function play(label: string, run: () => Promise<Me>, success: string, item?: number) {
    setBusy(label);
    try {
      const next = await run();
      setMe(next);
      setNotice({ text: success, tone: "ok" });
      if (item) setFlash(item);
      refresh();
    } catch (e) {
      setNotice({ text: (e as Error).message, tone: "no" });
    } finally {
      setBusy(null);
    }
  }

  async function enter(name: string) {
    const key = sk ?? newSecretKey();
    saveKey(key);
    saveName(name);
    setSk(key);
    await play(
      "join",
      () => transport.move(key, { kind: "join", name }),
      `Welcome, ${name}. Your starter kit is in your satchel.`,
    );
  }

  function importKey(key: Uint8Array) {
    saveKey(key);
    setSk(key);
    setMe(null);
    setLoaded(false);
  }

  if (!loaded) return <div className="min-h-[60vh]" />;
  if (!sk || !me)
    return (
      <Gate
        onEnter={enter}
        onImport={importKey}
        busy={busy === "join"}
        error={notice?.tone === "no" ? notice.text : null}
        full={!!world && world.players >= world.capacity}
      />
    );

  const key = sk;
  const items = me.items;
  const progress = cooling && world ? 1 - (me.next_gather_at - now) / world.tick_ms : 1;

  return (
    <div className="mx-auto max-w-page px-5 pt-8 pb-20">
      {transport.revived && (
        <p className="mb-6 rounded-md border border-acid/40 bg-acid-soft px-4 py-3 text-sm text-acid">
          Revived from <span className="font-mono">{transport.revived.escrow}</span>, epoch {transport.revived.epoch}.
          This world runs in your browser on the sealed core; no studio server is involved.
        </p>
      )}
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase">{title(items)}</p>
          <h1 className="mt-2 font-display text-h1 font-black">{me.name}</h1>
          <p className="mt-2 font-mono text-xs text-ink-3">
            key {pk?.slice(0, 10)}… · renown {renown(items)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {world && (
            <span className="rounded-sm border border-line px-3 py-1.5 font-mono text-xs text-ink-2">
              {world.players}/{world.capacity} in the world
            </span>
          )}
          <KeyMenu sk={key} name={me.name} onForget={() => (forgetKey(), setSk(null), setMe(null))} />
        </div>
      </header>

      <p
        role="status"
        aria-live="polite"
        className={`mt-4 min-h-6 text-sm ${notice?.tone === "no" ? "text-flare" : "text-acid"}`}
      >
        {notice?.text}
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <section aria-labelledby="nodes">
            <div className="flex items-baseline justify-between">
              <h2 id="nodes" className="font-display text-h2 font-bold">
                The six nodes
              </h2>
              <span className="font-mono text-xs text-ink-3">one gather per {(world?.tick_ms ?? 2000) / 1000}s</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {NODES.map((id) => {
                const item = ITEMS[id];
                return (
                  <button
                    key={id}
                    disabled={!!busy || cooling}
                    onClick={() =>
                      play(
                        `gather-${id}`,
                        () => transport.move(key, { kind: "gather", node: id }),
                        `+1 ${item.name}`,
                        id,
                      )
                    }
                    aria-label={`Gather ${item.name}`}
                    className="group relative overflow-hidden rounded-lg border border-line bg-panel p-4 text-left transition hover:-translate-y-0.5 hover:border-line-strong disabled:cursor-wait disabled:hover:translate-y-0"
                    style={{ boxShadow: `inset 0 -60px 60px -60px ${item.color}55` }}
                  >
                    <Glyph id={id} size={34} className="transition group-hover:animate-flicker" />
                    <span className="mt-3 block font-display font-bold">{item.name}</span>
                    <span className="block text-xs text-ink-3">{item.lore}</span>
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-1"
                      style={{ background: item.color, transform: `scaleX(${progress})`, transformOrigin: "left" }}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="forge">
            <h2 id="forge" className="font-display text-h2 font-bold">
              The forge
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {RECIPES.map((r) => {
                const product = ITEMS[r.product];
                const ready = canForge(items, r);
                const phoenix = r.product === 14;
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-4 transition ${
                      phoenix ? "border-ember/50 bg-ember-soft sm:col-span-2" : "border-line bg-panel"
                    } ${ready ? "shadow-ember" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <Glyph id={r.product} size={phoenix ? 40 : 30} className={ready ? "animate-flicker" : ""} />
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-bold">{product.name}</p>
                        <p className="truncate text-xs text-ink-3">{product.lore}</p>
                      </div>
                      <button
                        aria-label={`Forge ${product.name}`}
                        disabled={!ready || !!busy}
                        onClick={() =>
                          play(
                            `forge-${r.id}`,
                            () => transport.move(key, { kind: "forge", recipe: r.id }),
                            `You forged a ${product.name}.`,
                            r.product,
                          )
                        }
                        className="rounded-md bg-ember px-3.5 py-2 font-display text-xs font-bold tracking-wide text-void uppercase transition disabled:bg-panel-2 disabled:text-ink-3"
                      >
                        Forge
                      </button>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {r.needs.map(([id, q]) => {
                        const have = qtyOf(items, id);
                        return (
                          <li
                            key={id}
                            className={`flex items-center gap-1 rounded-sm px-2 py-0.5 font-mono text-xs ${
                              have >= q ? "bg-acid-soft text-acid" : "bg-night text-ink-3"
                            }`}
                          >
                            <Glyph id={id} size={12} />
                            {Math.min(have, q)}/{q} {ITEMS[id].name}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <Satchel items={items} flash={flash} />
          {transport.revived ? null : <SealCheck sk={key} />}
          {world && (
            <Board
              world={world}
              me={pk!}
              items={items}
              busy={!!busy}
              onGift={(to, name, item, qty) =>
                play(
                  "gift",
                  () => transport.move(key, { kind: "gift", to, item, qty }),
                  `You gave ${qty} ${ITEMS[item as ItemId].name} to ${name}.`,
                )
              }
            />
          )}
          {world && <Feed world={world} />}
        </div>
      </div>
    </div>
  );
}

function Satchel({ items, flash }: { items: Items; flash: number | null }) {
  const relics = items.filter(([id]) => id >= 9);
  const materials = items.filter(([id]) => id < 9);
  return (
    <section aria-labelledby="satchel" className="rounded-lg border border-line-strong bg-panel-2 p-5 shadow-deep">
      <h2 id="satchel" className="font-display text-lg font-bold">
        Your satchel
      </h2>
      {items.length === 0 && <p className="mt-3 text-sm text-ink-3">Empty. Visit a node.</p>}
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {materials.map(([id, q]) => (
          <Slot key={id} id={id} q={q} flash={flash === id} />
        ))}
      </ul>
      {relics.length > 0 && (
        <>
          <p className="mt-5 font-mono text-[11px] tracking-[0.25em] text-gold uppercase">Relics</p>
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {relics.map(([id, q]) => (
              <Slot key={id} id={id} q={q} flash={flash === id} relic />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Slot({ id, q, flash, relic }: { id: number; q: number; flash: boolean; relic?: boolean }) {
  return (
    <li
      key={`${id}-${q}`}
      className={`flex flex-col items-center rounded-md border py-3 ${relic ? "border-gold/40 bg-gold-soft" : "border-line bg-night"} ${
        flash ? "animate-pop" : ""
      }`}
    >
      <Glyph id={id} size={26} />
      <span className="mt-1.5 font-mono text-sm font-bold">{q}</span>
      <span className="text-[11px] text-ink-3">{ITEMS[id as ItemId]?.name}</span>
    </li>
  );
}

function Board({
  world,
  me,
  items,
  busy,
  onGift,
}: {
  world: WorldView;
  me: string;
  items: Items;
  busy: boolean;
  onGift: (to: string, name: string, item: number, qty: number) => void;
}) {
  const [to, setTo] = useState<{ pk: string; name: string } | null>(null);
  const [item, setItem] = useState<number>(items[0]?.[0] ?? 1);
  return (
    <section aria-labelledby="board" className="rounded-lg border border-line bg-panel p-5">
      <h2 id="board" className="font-display text-lg font-bold">
        Renown
      </h2>
      <ol className="mt-3 space-y-1">
        {world.board.map((p, i) => (
          <li key={p.pk} className="flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm odd:bg-night/60">
            <span className="w-5 font-mono text-xs text-ink-3">{i + 1}</span>
            <span className={`min-w-0 flex-1 truncate font-bold ${p.pk === me ? "text-ember" : ""}`}>{p.name}</span>
            <span className="hidden text-xs text-ink-3 sm:inline">{p.title}</span>
            <span className="w-10 text-right font-mono text-xs">{p.renown}</span>
            {p.pk !== me && (
              <button
                onClick={() => setTo({ pk: p.pk, name: p.name })}
                className="rounded-sm border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:border-gold hover:text-gold"
                aria-label={`Gift ${p.name}`}
              >
                Gift
              </button>
            )}
          </li>
        ))}
      </ol>
      {to && (
        <form
          className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-gold/40 bg-gold-soft p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const chosen = items.some(([id]) => id === item) ? item : items[0]?.[0];
            if (chosen) onGift(to.pk, to.name, chosen, 1);
            setTo(null);
          }}
        >
          <span>Give {to.name} one</span>
          <select
            value={item}
            onChange={(e) => setItem(Number(e.target.value))}
            className="rounded-sm border border-line bg-night px-2 py-1"
            aria-label="Item to give"
          >
            {items.map(([id]) => (
              <option key={id} value={id}>
                {ITEMS[id as ItemId]?.name}
              </option>
            ))}
          </select>
          <button disabled={busy || items.length === 0} className="rounded-sm bg-gold px-3 py-1 font-bold text-void">
            Give
          </button>
          <button type="button" onClick={() => setTo(null)} className="text-ink-3 hover:text-ink">
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}

function Feed({ world }: { world: WorldView }) {
  return (
    <section aria-labelledby="feed" className="rounded-lg border border-line bg-panel p-5">
      <h2 id="feed" className="font-display text-lg font-bold">
        The world, live
      </h2>
      <ul className="mt-3 space-y-1.5">
        {world.events.slice(0, 10).map((e) => (
          <li key={`${e.at}-${e.text}`} className="flex items-center gap-2 text-sm text-ink-2">
            {e.item ? <Glyph id={e.item} size={14} /> : <span className="h-3.5 w-3.5 rounded-full bg-ember/60" />}
            <span className="truncate">{e.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 font-mono text-[11px] break-all text-ink-3">
        server core sha256 {world.core_sha256}
      </p>
    </section>
  );
}

function KeyMenu({ sk, name, onForget }: { sk: Uint8Array; name: string; onForget: () => void }) {
  function backup() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            game: "embergate",
            name,
            public_key: publicKeyOf(sk),
            secret_key: bytesToHex(sk),
            note: "Your Embergate key. Whoever holds it owns your items, in this world and in any world restored from its escrow.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `embergate-key-${name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="flex gap-2">
      <button
        onClick={backup}
        className="rounded-sm border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-acid hover:text-acid"
      >
        Back up my key
      </button>
      <button
        onClick={() =>
          confirm("Forget this key in this browser? Without a backup, its items cannot be reclaimed.") && onForget()
        }
        className="rounded-sm border border-line px-3 py-1.5 text-xs text-ink-3 hover:border-flare hover:text-flare"
      >
        Leave
      </button>
    </div>
  );
}
