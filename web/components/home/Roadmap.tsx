/** What comes after a game is back: designed, not built yet, and labelled so. */
const NEXT = [
  {
    title: "Hosts paid only while they provably serve",
    body: "A revived game needs somewhere to run for everyone at once. Community hosts run the released core in an enclave; the escrow pays them from a pool only for the hours NEAR's DCAP verifier confirms they served it.",
  },
  {
    title: "Items handed over on other chains",
    body: "A player's sealed items can follow them out of the game. With NEAR Chain Signatures, the escrow itself signs a transfer on Ethereum or Solana, so a Phoenix relic becomes a token its owner holds anywhere.",
  },
  {
    title: "Every engine",
    body: "Rust, C++ and C cores are sealed today. Unity's C# (NativeAOT to WebAssembly), Go (TinyGo) and Zig follow the same interface: no imports, the shared exports.",
  },
  {
    title: "Mainnet, and bigger worlds",
    body: "A world holds 64 players today. Paged snapshots under one root lift that; the escrow, verifier and checks stay as they are.",
  },
];

export function Roadmap() {
  return (
    <section className="mx-auto mt-28 max-w-page px-5" aria-labelledby="next">
      <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">Next, and not built yet</p>
      <h2 id="next" className="mt-4 max-w-4xl font-display text-h1 font-black">
        After the game comes back.
      </h2>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
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
