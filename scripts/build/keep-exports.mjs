// Rewrites a wasm module's export section to keep only the named exports (and `memory`), so a toolchain's leftovers
// (TinyGo's _initialize and libc helpers) are not mistaken for a game's moves. wasm-opt then drops the dead code.
//   node scripts/build/keep-exports.mjs in.wasm out.wasm name...
import { readFileSync, writeFileSync } from "node:fs";

const [input, output, ...keep] = process.argv.slice(2);
const bytes = readFileSync(input);
const wanted = new Set(["memory", ...keep]);

function leb(buf, at) {
  let n = 0;
  let shift = 0;
  for (;;) {
    const b = buf[at++];
    n |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) return [n >>> 0, at];
  }
}
function uleb(n) {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}

const parts = [bytes.subarray(0, 8)];
let at = 8;
const found = new Set();
while (at < bytes.length) {
  const id = bytes[at];
  const [size, body] = leb(bytes, at + 1);
  const end = body + size;
  if (id !== 7) {
    parts.push(bytes.subarray(at, end));
  } else {
    let [n, p] = leb(bytes, body);
    const kept = [];
    while (n--) {
      const start = p;
      const [len, nameAt] = leb(bytes, p);
      const name = bytes.subarray(nameAt, nameAt + len).toString();
      [, p] = leb(bytes, nameAt + len + 1);
      if (wanted.has(name)) {
        kept.push(bytes.subarray(start, p));
        found.add(name);
      }
    }
    const section = Buffer.concat([uleb(kept.length), ...kept]);
    parts.push(Buffer.from([7]), uleb(section.length), section);
  }
  at = end;
}
const missing = [...wanted].filter((n) => !found.has(n));
if (missing.length) {
  console.error(`${input}: missing exports ${missing.join(", ")}`);
  process.exit(1);
}
writeFileSync(output, Buffer.concat(parts));
