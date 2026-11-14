import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { qtyOf } from "./items";
import { newSecretKey, parseSignedMove, publicKeyOf, signMove, type Move } from "./moves";
import { CAPACITY, EMPTY_WORLD, TICK_MS, play, totals, type World } from "./world";

const wasmModule = new WebAssembly.Module(readFileSync(path.join(__dirname, "../../public/core/embergate.wasm")));
const T0 = 1_800_000_000_000;

function player(name: string) {
  const sk = newSecretKey();
  let clock = T0;
  return {
    pk: publicKeyOf(sk),
    move: (m: Move, at = ++clock) => signMove(sk, m, at),
    join: () => signMove(sk, { kind: "join", name }, ++clock),
  };
}

async function ok(world: World, s: ReturnType<typeof signMove>, now = s.nonce) {
  const out = await play(world, s, now, wasmModule);
  if (!out.ok) throw new Error(out.reason);
  return out;
}

describe("playing Embergate", () => {
  it("joins with the starter kit, gathers once per tick, and forges", async () => {
    const ada = player("Ada");
    let w = (await ok(EMPTY_WORLD, ada.join())).world;
    expect(w.players[0].items).toEqual([
      [1, 3],
      [2, 2],
    ]);

    const t = T0 + 10 * TICK_MS;
    w = (await ok(w, ada.move({ kind: "gather", node: 2 }, t), t)).world;
    const again = await play(w, ada.move({ kind: "gather", node: 2 }, t + 1), t + 1, wasmModule);
    expect(again).toMatchObject({ ok: false, status: 422, reason: "already gathered this tick" });

    w = (await ok(w, ada.move({ kind: "forge", recipe: 1 }, t + 2), t + 2)).world;
    expect(qtyOf(w.players[0].items, 9)).toBe(1);
    expect(w.events.map((e) => e.kind)).toEqual(["join", "gather", "forge"]);
  });

  it("conserves items when players gift each other", async () => {
    const ada = player("Ada");
    const bo = player("Bo");
    let w = (await ok(EMPTY_WORLD, ada.join())).world;
    w = (await ok(w, bo.join())).world;
    const before = totals(w);
    w = (await ok(w, ada.move({ kind: "gift", to: bo.pk, item: 1, qty: 2 }))).world;
    expect(totals(w)).toEqual(before);
    expect(qtyOf(w.players[1].items, 1)).toBe(5);
    const greedy = await play(w, ada.move({ kind: "gift", to: bo.pk, item: 1, qty: 9 }), T0 + 50, wasmModule);
    expect(greedy).toMatchObject({ ok: false, reason: "not enough items" });
  });

  it("refuses forged signatures, replays and stale moves", async () => {
    const ada = player("Ada");
    const w = (await ok(EMPTY_WORLD, ada.join())).world;
    const move = ada.move({ kind: "gather", node: 1 });

    const forged = { ...move, move: { kind: "gather" as const, node: 2 } };
    expect(await play(w, forged, move.nonce, wasmModule)).toMatchObject({ ok: false, status: 401 });

    const after = (await ok(w, move)).world;
    expect(await play(after, move, move.nonce, wasmModule)).toMatchObject({ ok: false, status: 409 });

    const stale = ada.move({ kind: "gather", node: 1 }, T0 - 10 * 60_000);
    expect(await play(after, stale, T0, wasmModule)).toMatchObject({ ok: false, status: 400 });

    const stranger = player("Eve");
    expect(await play(after, stranger.move({ kind: "gather", node: 1 }), T0 + 9, wasmModule)).toMatchObject({
      status: 404,
    });
  });

  it("holds 64 players and refuses the 65th", async () => {
    let w: World = EMPTY_WORLD;
    for (let i = 0; i < CAPACITY; i++) w = (await ok(w, player(`p${i}`).join())).world;
    expect(w.players).toHaveLength(CAPACITY);
    expect(await play(w, player("late").join(), T0 + 1, wasmModule)).toMatchObject({ ok: false, status: 403 });
  });

  it("parses only well-formed moves", () => {
    const ada = player("Ada");
    const s = ada.move({ kind: "gift", to: ada.pk, item: 1, qty: 1 });
    expect(parseSignedMove(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSignedMove({ ...s, pk: s.pk.toUpperCase() })).toMatch(/pk/);
    expect(parseSignedMove({ ...s, move: { kind: "join", name: "<script>" } })).toMatch(/name/);
    expect(parseSignedMove({ ...s, move: { kind: "steal" } })).toMatch(/kind/);
  });
});

describe("the other games, through the same signed moves", () => {
  const matchday = new WebAssembly.Module(readFileSync(path.join(__dirname, "../../public/core/matchday.wasm")));
  const sk = newSecretKey();
  const at = (t: number, m: Move, game = "matchday") => signMove(sk, m, t, game);

  it("joins, opens a pack and plays a match in Matchday, the server supplying every tick", async () => {
    let w = (await play(EMPTY_WORLD, at(T0 + 1, { kind: "join", name: "Club" }), T0 + 1, matchday, "matchday")) as {
      ok: true;
      world: World;
    };
    expect(w.world.players[0].items).toEqual([
      [1, 1000],
      [2, 1],
      [5, 3],
    ]);
    const t = T0 + 20 * TICK_MS;
    const opened = await play(w.world, at(t, { kind: "call", name: "open_pack", args: [2] }), t, matchday, "matchday");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    w = opened;
    expect(w.world.players[0].items.filter(([id]) => id >= 100).reduce((n, [, q]) => n + q, 0)).toBe(3);

    const same = await play(
      w.world,
      at(t + 1, { kind: "call", name: "play_match", args: [] }),
      t + 1,
      matchday,
      "matchday",
    );
    expect(same).toMatchObject({ ok: false, status: 422, reason: "one action per tick: wait a moment" });
    const next = t + TICK_MS;
    const match = await play(
      w.world,
      at(next, { kind: "call", name: "play_match", args: [] }),
      next,
      matchday,
      "matchday",
    );
    expect(match.ok && match.out?.length).toBe(4);
    expect(match.ok && match.world.events.at(-1)?.text).toMatch(
      /^You (won|drew|lost) \(squad \d+ v \d+\), \+\d+ coins$/,
    );
  });

  it("refuses a move signed for another game, a move the game does not declare, and Embergate's own moves", async () => {
    const joined = await play(EMPTY_WORLD, at(T0 + 1, { kind: "join", name: "Club" }), T0 + 1, matchday, "matchday");
    if (!joined.ok) throw new Error(joined.reason);
    const forEmbergate = at(T0 + 2, { kind: "call", name: "buy_fitness", args: [] }, "embergate");
    expect(await play(joined.world, forEmbergate, T0 + 2, matchday, "matchday")).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      await play(
        joined.world,
        at(T0 + 3, { kind: "call", name: "restore_tick", args: [0] }),
        T0 + 3,
        matchday,
        "matchday",
      ),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await play(joined.world, at(T0 + 4, { kind: "gather", node: 1 }), T0 + 4, matchday, "matchday"),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});
