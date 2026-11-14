import type { Metadata } from "next";
import { CoreChecker } from "@/components/tools/CoreChecker";
import { EscrowLookup } from "@/components/tools/EscrowLookup";
import { FindMyItems } from "@/components/tools/FindMyItems";
import { WorldChecker } from "@/components/tools/WorldChecker";
import { REPO } from "@/lib/encroe/escrows";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Check your game core before you seal it, check your players file, find your items in a released game, and build recipes for Rust, C++, C, Zig and Go.",
};

const RECIPES = [
  {
    lang: "Rust",
    example: "crates/embergate-core",
    code: `# Cargo.toml: [lib] crate-type = ["cdylib"]; [profile.release] opt-level = "z", lto = true, panic = "abort", strip = true
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown`,
  },
  {
    lang: "C++",
    example: "cores/matchday/matchday.cpp",
    code: `# Zig 0.17 bundles clang: no system toolchain needed
zig c++ -target wasm32-freestanding -O2 -g0 -nostdlib -std=c++20 \\
  -fno-exceptions -fno-rtti -Wl,--no-entry -Wl,--strip-all -o core.wasm core.cpp`,
  },
  {
    lang: "C",
    example: "cores/neon-city/neon_city.c",
    code: `zig cc -target wasm32-freestanding -O2 -g0 -nostdlib -std=c11 \\
  -Wl,--no-entry -Wl,--strip-all -o core.wasm core.c`,
  },
  {
    lang: "Zig",
    example: "cores/starhaul/starhaul.zig",
    code: `# export exactly the interface and your moves
zig build-exe core.zig -target wasm32-freestanding -fno-entry -O ReleaseSmall -fstrip \\
  --export=input_ptr --export=output_ptr --export=load --export=get_state --export=trade \\
  --export=player_count --export=get_key --export=join ... -femit-bin=core.wasm`,
  },
  {
    lang: "Go",
    example: "cores/orchard/main.go",
    code: `# TinyGo, with //export (not //go:wasmexport: the enclave calls no _initialize)
tinygo build -target=wasm-unknown -gc=none -scheduler=none -panic=trap \\
  -opt=z -no-debug -o core.wasm .
# then keep only your exports: scripts/build/keep-exports.mjs`,
  },
];

export default function ToolsPage() {
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-acid uppercase">Tools</p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Check it before <span className="text-acid">you seal it.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        Your game’s server is compiled by your own toolchain, as it is today. These tools run in your browser and tell
        you, before anything touches NEAR, whether the enclave will accept what you built.
      </p>
      <nav aria-label="Tools" className="mt-8 flex flex-wrap gap-2 text-sm">
        {[
          ["#core", "Core checker"],
          ["#world", "Players file"],
          ["#build", "Build recipes"],
          ["#items", "Find my items"],
          ["#lookup", "Escrow lookup"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-sm border border-line px-3 py-1.5 text-ink-2 hover:border-acid hover:text-acid"
          >
            {label}
          </a>
        ))}
      </nav>

      <Tool
        id="core"
        kicker="For studios · step 2"
        title="Core checker"
        intro="Drop your compiled core. Your browser runs what the enclave’s pinned verifier will: no imports, the
        exports it calls, three generated worlds of 64 players served byte for byte, 1,200 seeded trades that must
        create and destroy nothing."
      >
        <CoreChecker />
      </Tool>

      <Tool
        id="world"
        kicker="For studios · step 3"
        title="Players file"
        intro="The world you seal: every player’s key and items, as your server exports it. This is the file the seal
        command reads."
      >
        <WorldChecker />
      </Tool>

      <Tool
        id="build"
        kicker="For studios"
        title="Build recipes"
        intro="Any language that compiles to wasm32 with no imports. These are the exact commands behind the five cores we
        sealed; each one is a working template."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {RECIPES.map((r) => (
            <article key={r.lang} className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-display text-h2 font-black text-gold">{r.lang}</h3>
              <pre className="mt-3 overflow-x-auto rounded-md bg-night p-3 font-mono text-[11px] text-ink-2">
                {r.code}
              </pre>
              <a
                href={`${REPO}/blob/main/${r.example}`}
                className="mt-3 inline-block text-sm text-gold underline underline-offset-4"
              >
                A full core in {r.lang}
              </a>
            </article>
          ))}
        </div>
      </Tool>

      <Tool
        id="items"
        kicker="For players"
        title="Find my items"
        intro="In a released game, with the key backup you saved while playing. Your browser brings the world back from NEAR
        and checks it, then looks for your key."
      >
        <FindMyItems />
      </Tool>

      <Tool
        id="lookup"
        kicker="For everyone"
        title="Escrow lookup"
        intro="Any escrow’s page: its keys, its code, what is sealed, its verification runs, and what anyone may do."
      >
        <EscrowLookup />
      </Tool>
    </main>
  );
}

function Tool(props: { id: string; kicker: string; title: string; intro: string; children: React.ReactNode }) {
  const { id, kicker, title, intro, children } = props;
  return (
    <section id={id} className="mt-16 scroll-mt-8" aria-labelledby={`${id}-title`}>
      <p className="font-mono text-xs tracking-[0.25em] text-gold uppercase">{kicker}</p>
      <h2 id={`${id}-title`} className="mt-2 font-display text-h1 font-black">
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-ink-2">{intro}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
