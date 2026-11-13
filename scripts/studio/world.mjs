// Plays a scripted world through a sealed core and prints it as a players file (`encore seal --players-file`):
//   node scripts/studio/world.mjs <matchday|neon-city|embergate> <players> > world.json
// Every move runs in the core itself; the players are scripted test players with random keys, and say so.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const [game, n = "8"] = process.argv.slice(2);
const wasm = readFileSync(new URL(`../../web/public/core/${game}.wasm`, import.meta.url));
const { instance } = await WebAssembly.instantiate(wasm, {});
const x = instance.exports;
const mem = () => new Uint8Array(x.memory.buffer);

mem().set([0, 0, 0, 0], x.input_ptr());
x.load(4);
const keys = Array.from({ length: Number(n) }, () => randomBytes(32));
for (const k of keys) {
  mem().set(k, x.input_ptr());
  if (x.join() < 0) throw new Error("the world is full");
}

const ok = (code) => code === 0;
let tick = 1;
for (let round = 0; round < 24; round++, tick++) {
  keys.forEach((_, p) => {
    const style = p % 4;
    if (game === "matchday") {
      if (round === 0) x.open_pack(p, 2, tick);
      else if (style === 0 && round % 3 === 1) ok(x.buy_pack(p, 3)) && x.open_pack(p, 3, tick);
      else if (style === 3 && round === 5) ok(x.buy_pack(p, 4)) || x.buy_pack(p, 2);
      else if (style === 3 && round === 6) x.open_pack(p, 4, tick) && x.open_pack(p, 2, tick);
      else ok(x.play_match(p, tick)) || x.buy_fitness(p);
    } else if (game === "neon-city") {
      if (round === 16 && style >= 2) x.buy(p, 21);
      else if (!ok(x.job(p, style >= 2 && round > 16 ? 2 : 1, tick))) for (let f = 0; f < 4; f++) x.buy(p, 2);
    } else {
      ok(x.gather(p, 1 + ((p + round) % 6), tick)) && round % 4 === 3 && x.craft(p, 1);
    }
  });
}
// A few gifts between players, through the same `trade` the enclave checks.
for (let p = 1; p < keys.length; p += 3) x.trade(p, p - 1, 1, 5);

const players = keys.map((k, p) => {
  const len = x.get_state(p);
  const view = new DataView(x.memory.buffer, x.output_ptr(), len);
  const items = Array.from({ length: view.getUint32(0, true) }, (_, i) => [
    view.getUint32(4 + 8 * i, true),
    view.getUint32(8 + 8 * i, true),
  ]);
  return { pk: k.toString("hex"), items };
});
console.log(JSON.stringify(players, null, 1));
