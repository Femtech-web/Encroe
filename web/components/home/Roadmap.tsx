import Link from "next/link";

/** After a game is back: what already works on testnet, then what is designed and not built, labelled so. */
const LIVE = [
  {
    title: "Play on, with no server",
    body: "The revived core runs in each player's browser, from NEAR and FastFS alone, with every player's items.",
    href: "/revive",
    cta: "Bring a game back",
  },
  {
    title: "Take your items to another chain",
    body: "NEAR Chain Signatures signs a player's claim to their own sealed items; a token on Base Sepolia mints exactly that, once.",
    href: "/revive",
    cta: "Claim after a release",
  },
  {
    title: "An agent keeps watch",
    body: "Every 30 minutes, the preservation agent releases silent studios' games and brings every released game back, with all its checks.",
    href: "/agent",
    cta: "The agent's log",
  },
  {
    title: "Any AI can do the same",
    body: "The site is an MCP server: list escrows, inspect one, release a silent studio's game, bring it back, find a player's items.",
    href: "/judges",
    cta: "Connect an agent",
  },
];

const NEXT = [
  {
    title: "Hosts paid only while they provably serve",
    body: "One shared world after a release: community hosts run the released core in an enclave, and a pool pays them only for the windows NEAR's DCAP verifier confirms they served it.",
  },
  {
    title: "Items on Ethereum and Solana",
    body: "The handover runs on Base Sepolia. The same MPC key signs for Ethereum; an Ed25519 domain would reach Solana.",
  },
  {
    title: "Unity's C#",
    body: "Rust, C++, C, Zig and Go are sealed today. C#'s WebAssembly runtime needs host imports the pinned verifier refuses, so it needs a new verifier first.",
  },
  {
    title: "Mainnet, and bigger worlds",
    body: "A world holds 64 players today. Paged snapshots under one root lift that; the escrow, verifier and checks stay as they are.",
  },
];

export function Roadmap() {
  return (
    <section className="mx-auto mt-28 max-w-page px-5" aria-labelledby="next">
      <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">What happens next</p>
      <h2 id="next" className="mt-4 max-w-4xl font-display text-h1 font-black">
        After the game comes back.
      </h2>
      <p className="mt-8 font-mono text-xs tracking-[0.25em] text-acid uppercase">Working on testnet</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {LIVE.map((n) => (
          <article key={n.title} className="flex flex-col rounded-xl border border-acid/30 bg-panel p-6">
            <h3 className="font-display text-lg font-bold">{n.title}</h3>
            <p className="mt-2 flex-1 text-sm text-ink-2">{n.body}</p>
            <Link href={n.href} className="mt-4 text-sm text-acid underline underline-offset-4">
              {n.cta}
            </Link>
          </article>
        ))}
      </div>
      <p className="mt-10 font-mono text-xs tracking-[0.25em] text-ink-3 uppercase">Designed, not built yet</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {NEXT.map((n) => (
          <article key={n.title} className="rounded-xl border border-dashed border-line-strong bg-panel/60 p-6">
            <h3 className="font-display text-lg font-bold">{n.title}</h3>
            <p className="mt-2 text-sm text-ink-2">{n.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
