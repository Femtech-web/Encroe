#!/usr/bin/env bash
# Builds the game cores written in other languages to WebAssembly (wasm32, no imports), copies them into
# web/public/core, and prints their SHA-256.
#   Matchday (C++) and Neon City (C) with Zig's bundled clang, Starhaul (Zig), Orchard (Go, with TinyGo).
# Toolchains, each sha256-checked into .tools/ (or point at your own):
#   ZIG=.tools/zig/zig            Zig 0.17.0 (https://ziglang.org/download/)
#   TINYGO=.tools/tinygo/bin/tinygo TinyGo 0.44.0, which runs on Go 1.25 to 1.27 (GOTOOLCHAIN=go1.26.0 fetches one)
#   WASMOPT=.tools/binaryen/bin/wasm-opt Binaryen version_133
set -euo pipefail
cd "$(dirname "$0")/../.."
ZIG=${ZIG:-.tools/zig/zig}
TINYGO=${TINYGO:-$PWD/.tools/tinygo/bin/tinygo}
export WASMOPT=${WASMOPT:-$PWD/.tools/binaryen/bin/wasm-opt}
export GOTOOLCHAIN=${GOTOOLCHAIN:-go1.26.0}
for t in "$ZIG" "$TINYGO" "$WASMOPT"; do [ -x "$t" ] || { echo "no toolchain at $t" >&2; exit 2; }; done
OUT=target/cores
mkdir -p "$OUT" web/public/core
ABI=(input_ptr output_ptr player_count load get_key get_state trade join restore_tick)
# -g0 and --strip-all: no debug info in a sealed core (it would carry this machine's paths and triple the size).
FLAGS=(-target wasm32-freestanding -O2 -g0 -nostdlib -Wall -Wextra -Werror -Wl,--no-entry -Wl,--strip-all
  -Wl,-z,stack-size=65536)

"$ZIG" c++ "${FLAGS[@]}" -std=c++20 -fno-exceptions -fno-rtti -o "$OUT/matchday.wasm" cores/matchday/matchday.cpp
"$ZIG" cc "${FLAGS[@]}" -std=c11 -o "$OUT/neon-city.wasm" cores/neon-city/neon_city.c

# Zig exports exactly the interface and the game's moves.
exports=()
for f in "${ABI[@]}" mine refine deliver buy sell; do exports+=("--export=$f"); done
"$ZIG" build-exe cores/starhaul/starhaul.zig -target wasm32-freestanding -fno-entry "${exports[@]}" -O ReleaseSmall \
  -fstrip --stack 65536 -femit-bin="$OUT/starhaul.wasm"

# TinyGo's plain //export needs no runtime start (the enclave never calls one); its leftover exports are dropped.
(cd cores/orchard && "$TINYGO" build -o "../../$OUT/orchard.raw.wasm" -target=wasm-unknown -gc=none -scheduler=none \
  -panic=trap -opt=z -no-debug .)
node scripts/build/keep-exports.mjs "$OUT/orchard.raw.wasm" "$OUT/orchard.kept.wasm" "${ABI[@]}" tend make fair buy sell
"$WASMOPT" -Oz --remove-unused-module-elements --strip-debug --strip-producers "$OUT/orchard.kept.wasm" -o "$OUT/orchard.wasm"
rm "$OUT/orchard.raw.wasm" "$OUT/orchard.kept.wasm"

for core in matchday neon-city starhaul orchard; do
  node -e '
    const m = new WebAssembly.Module(require("fs").readFileSync(process.argv[1]));
    const imports = WebAssembly.Module.imports(m);
    if (imports.length) { console.error(process.argv[1], "imports", imports); process.exit(1); }' "$OUT/$core.wasm"
  if grep -q "$PWD" "$OUT/$core.wasm"; then echo "$core.wasm carries a local path" >&2; exit 1; fi
  cp "$OUT/$core.wasm" "web/public/core/$core.wasm"
done
shasum -a 256 web/public/core/{matchday,neon-city,starhaul,orchard}.wasm
