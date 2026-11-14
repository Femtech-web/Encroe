import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CreateEscrowClient } from "@/components/studios/CreateEscrowClient";
import { FACTORY, factoryListings, view } from "@/lib/encroe/directory";
import { REPO } from "@/lib/encroe/escrows";

export const metadata: Metadata = {
  title: "For studios",
  description:
    "Put your game in escrow on NEAR: one transaction to create it, one command to seal your server, a heartbeat to keep it yours.",
};

const STEPS = [
  {
    n: "1",
    title: "Create your escrow",
    body: "From your wallet, above. It is born keyless: nobody, including you and us, can ever change its rules.",
  },
  {
    n: "2",
    title: "Compile your server core",
    body: "Your game's rules and players' state, built to WebAssembly with no imports: Rust, C++, C, Zig, Go, or anything that targets wasm32. Then drop the .wasm into the core checker.",
    code: "# Rust\ncargo build --release --target wasm32-unknown-unknown\n# C++ (C: zig cc, -std=c11)\nzig c++ -target wasm32-freestanding -O2 -g0 -nostdlib \\\n  -Wl,--no-entry -Wl,--strip-all -o core.wasm core.cpp",
    link: { href: "/tools#core", label: "Check your core in the browser · all build recipes" },
  },
  {
    n: "3",
    title: "Seal your live world",
    body: "From your browser: drop in your core and players file, and your wallet signs three times (the key row, the commitment, the verification). The enclave checks the sealed build and NEAR checks the enclave. Or let a scheduled job run the same steps:",
    code: "ESCROW_ACCOUNT=your-game.encroe.testnet ESCROW_NAME=your-game \\\n  ENCROE_GAME_URL=https://your.game scripts/studio/bot.sh seal",
    link: { href: "/studios/seal", label: "Seal from your browser" },
  },
  {
    n: "4",
    title: "Keep your heartbeat",
    body: "A scheduled job sends it and re-seals your world, so your players' newest items are always inside. Stop it, and after your grace period the game is theirs.",
    link: { href: `${REPO}/blob/main/.github/workflows/studio.yml`, label: "The workflow" },
  },
];

const PROMISES = [
  {
    title: "A promise you cannot break",
    body: "Players buy a game that cannot be switched off for good. The escrow says so, and NEAR enforces it.",
  },
  {
    title: "Proof, not a policy page",
    body: "Anyone can check your sealed build is real without opening it, and every player can check their items are inside.",
  },
  {
    title: "Costs almost nothing",
    body: "5 NEAR of storage once. A heartbeat is one transaction. Verification is paid by whoever asks for it.",
  },
];

export default async function StudiosPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const [config, listings] = await Promise.all([view<object>(FACTORY, "config"), factoryListings()]);
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">For studios</p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Make your game <span className="text-gold">outlive you.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        Put your server in escrow on NEAR. While your studio lives, nothing changes for you. If it ever goes quiet, the
        game goes to the people who played it, with everything they earned.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          {PROMISES.map((p) => (
            <div key={p.title} className="rounded-lg border border-line bg-panel p-5">
              <h2 className="font-display text-lg font-bold">{p.title}</h2>
              <p className="mt-2 text-sm text-ink-2">{p.body}</p>
            </div>
          ))}
          <p className="font-mono text-xs text-ink-3">
            {listings.length} escrow{listings.length === 1 ? "" : "s"} created through {FACTORY} ·{" "}
            <Link href="/escrows" className="underline underline-offset-4 hover:text-ink">
              the directory
            </Link>
          </p>
        </div>
        <CreateEscrowClient factory={FACTORY} live={config !== null} nonce={nonce} />
      </div>

      <section className="mt-20" aria-labelledby="steps">
        <h2 id="steps" className="font-display text-h1 font-black">
          Four steps, then nothing.
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-line bg-panel p-6">
              <span className="font-display text-4xl font-black text-gold">{s.n}</span>
              <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{s.body}</p>
              {s.code && (
                <pre className="mt-3 overflow-x-auto rounded-md bg-night p-3 font-mono text-[11px] text-ink-2">
                  {s.code}
                </pre>
              )}
              {s.link && (
                <a href={s.link.href} className="mt-3 inline-block text-sm text-gold underline underline-offset-4">
                  {s.link.label}
                </a>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
