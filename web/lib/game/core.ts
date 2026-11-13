import type { Items } from "./items";

/** One seat in the world: a player's 32-byte key and items, in the order the core indexes them. */
export type Seat = { pk: Uint8Array; items: Items };

type Exports = {
  memory: WebAssembly.Memory;
  input_ptr(): number;
  output_ptr(): number;
  load(len: number): number;
  player_count(): number;
  get_key(idx: number): number;
  get_state(idx: number): number;
  trade(from: number, to: number, item: number, qty: number): number;
  join(): number;
  gather(player: number, node: number, tick: number): number;
  craft(player: number, recipe: number): number;
  restore_tick(player: number, tick: number): number;
};

const INPUT_CAP = 16384;

/** `count:u32le || (pk[32] || n:u32le || (id:u32le, qty:u32le)*)*`, the snapshot the sealed package carries. */
export function encodeSnapshot(seats: Seat[]): Uint8Array {
  const size = 4 + seats.reduce((s, p) => s + 36 + 8 * p.items.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, seats.length, true);
  let at = 4;
  for (const { pk, items } of seats) {
    out.set(pk, at);
    view.setUint32(at + 32, items.length, true);
    at += 36;
    for (const [id, qty] of items) {
      view.setUint32(at, id, true);
      view.setUint32(at + 4, qty, true);
      at += 8;
    }
  }
  return out;
}

/**
 * Embergate's server core, the very wasm the studio seals: every rule of the economy runs in it. A host loads
 * the world, makes one move and reads the world back; the host itself decides nothing.
 */
export class Core {
  private constructor(private readonly x: Exports) {}

  static async create(module: WebAssembly.Module): Promise<Core> {
    const instance = await WebAssembly.instantiate(module, {});
    return new Core(instance.exports as unknown as Exports);
  }

  load(seats: Seat[]): void {
    const snapshot = encodeSnapshot(seats);
    if (snapshot.length > INPUT_CAP) throw new Error("world snapshot exceeds the core's input buffer");
    this.input().set(snapshot);
    if (this.x.load(snapshot.length) !== seats.length) throw new Error("the core refused the snapshot");
  }

  count(): number {
    return this.x.player_count();
  }

  items(idx: number): Items {
    const len = this.x.get_state(idx);
    if (len < 0) throw new Error(`no player ${idx}`);
    const view = new DataView(this.x.memory.buffer, this.x.output_ptr(), len);
    const n = view.getUint32(0, true);
    return Array.from({ length: n }, (_, i) => [view.getUint32(4 + 8 * i, true), view.getUint32(8 + 8 * i, true)]);
  }

  key(idx: number): Uint8Array {
    if (this.x.get_key(idx) !== 32) throw new Error(`no player ${idx}`);
    return new Uint8Array(this.x.memory.buffer, this.x.output_ptr(), 32).slice();
  }

  seats(): Seat[] {
    return Array.from({ length: this.count() }, (_, i) => ({ pk: this.key(i), items: this.items(i) }));
  }

  /** The player's index (a returning key gets its own back), or -1 when the world is full. */
  join(pk: Uint8Array): number {
    this.input().set(pk.subarray(0, 32));
    return this.x.join();
  }

  gather(player: number, node: number, tick: number): number {
    return this.x.gather(player, node, tick);
  }

  craft(player: number, recipe: number): number {
    return this.x.craft(player, recipe);
  }

  trade(from: number, to: number, item: number, qty: number): number {
    return this.x.trade(from, to, item, qty);
  }

  restoreTick(player: number, tick: number): void {
    this.x.restore_tick(player, tick);
  }

  private input(): Uint8Array {
    return new Uint8Array(this.x.memory.buffer, this.x.input_ptr(), INPUT_CAP);
  }
}
