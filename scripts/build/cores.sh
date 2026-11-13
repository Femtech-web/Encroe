#!/usr/bin/env bash
# Builds the game cores written in other languages to WebAssembly (wasm32, no imports) with Zig's bundled
# clang, copies them into web/public/core, and prints their SHA-256.
#   Matchday (C++), Neon City (C).
# Zig 0.17.0: ZIG=/path/to/zig, or .tools/zig/zig (https://ziglang.org/download/, sha256-checked).
set -euo pipefail
cd "$(dirname "$0")/../.."
ZIG=${ZIG:-.tools/zig/zig}
[ -x "$ZIG" ] || { echo "no zig at $ZIG (set ZIG=...)" >&2; exit 2; }
OUT=target/cores
mkdir -p "$OUT" web/public/core
FLAGS=(-target wasm32-freestanding -O2 -nostdlib -Wall -Wextra -Werror -Wl,--no-entry -Wl,-z,stack-size=65536)

"$ZIG" c++ "${FLAGS[@]}" -std=c++20 -fno-exceptions -fno-rtti -o "$OUT/matchday.wasm" cores/matchday/matchday.cpp
"$ZIG" cc "${FLAGS[@]}" -std=c11 -o "$OUT/neon-city.wasm" cores/neon-city/neon_city.c

for core in matchday neon-city; do
  node -e '
    const m = new WebAssembly.Module(require("fs").readFileSync(process.argv[1]));
    const imports = WebAssembly.Module.imports(m);
    if (imports.length) { console.error(process.argv[1], "imports", imports); process.exit(1); }' "$OUT/$core.wasm"
  cp "$OUT/$core.wasm" "web/public/core/$core.wasm"
done
shasum -a 256 web/public/core/matchday.wasm web/public/core/neon-city.wasm
