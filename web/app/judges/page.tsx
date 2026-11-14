import type { Metadata } from "next";
import Link from "next/link";
import { REPO, killTarget } from "@/lib/encroe/escrows";

export const metadata: Metadata = {
  title: "For judges",
  description:
    "Five minutes with Encroe, all live on NEAR testnet: play, check, kill a studio, bring the game back, try to break it.",
};

const tx = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const doc = (p: string) => `${REPO}/blob/main/${p}`;

const CLAIMS: { claim: string; evidence: string; href: string }[] = [
  {
    claim: "The key exists only in NEAR's MPC network until the escrow asks for it",
    evidence: "GO_NO_GO §E1; every release check",
    href: doc("GO_NO_GO.md"),
  },
  {
    claim: "Only the pinned verifier, run for this escrow, can read the studio's sealed key",
    evidence: "GO_NO_GO §E2: a thief build and a direct call refused",
    href: doc("GO_NO_GO.md"),
  },
  {
    claim: "A broken build turns the badge red; the real one green only after NEAR's DCAP verifier",
    evidence: "life-52e4, steps 3 to 7",
    href: doc("docs/results/escrow/life-52e4/README.md"),
  },
  {
    claim: "A replayed TDX quote is refused",
    evidence: "life-52e4 step 8, and attack 05 on /break, live",
    href: doc("docs/results/escrow/life-52e4/README.md"),
  },
  {
    claim: "Nobody releases while the studio lives",
    evidence: "kill-827e step 8, and attack 01 on /break, live",
    href: tx("KcRxiYe5MT96RmDFCc2kKvVmEHhydQU4QL1qX1AT6qv"),
  },
  {
    claim: "A stranger releases a silent studio; the game comes back in a browser; play goes on",
    evidence: "kill-827e",
    href: doc("docs/results/escrow/kill-827e/README.md"),
  },
  {
    claim: "A visitor does it from the site, with no wallet",
    evidence: "kill-beaa",
    href: doc("docs/results/escrow/kill-beaa/README.md"),
  },
  {
    claim: "Rust, C++ and C game servers all pass the same pinned verifier and come back in a browser",
    evidence: "the cores run",
    href: doc("docs/results/escrow/cores/README.md"),
  },
  {
    claim: "Zig and Go too: two more games sealed into factory escrows and verified green; each rebuilds byte for byte",
    evidence: "the engines run",
    href: doc("docs/results/escrow/engines/README.md"),
  },
  {
    claim: "A studio seals from its browser alone, and the enclave and NEAR accept it",
    evidence: "browser-seal",
    href: doc("docs/results/escrow/browser-seal/README.md"),
  },
  {
    claim:
      "An AI agent nobody wrote for Encroe preserves a game: Claude Code, with only the MCP server, released a silent studio's game and brought it back, all 8 checks, in 48 s",
    evidence: "the agent run",
    href: doc("docs/results/agent-runs/README.md"),
  },
  {
    claim:
      "A released world's items leave the game: minted on Base Sepolia through NEAR Chain Signatures, signed by a key nobody holds; forged, inflated and repeated claims refused",
    evidence: "the items run",
    href: doc("docs/results/items/README.md"),
  },
  {
    claim: "The site's public world is sealed and verified; players check their own items from the browser",
    evidence: "encroe-embergate, ember-3924",
    href: doc("docs/results/escrow/embergate/README.md"),
  },
  {
    claim: "The browser's crypto matches the Rust tools byte for byte",
    evidence: "release.test.ts, proof.test.ts: real released epochs and on-chain roots",
    href: doc("web/lib/encroe/release.test.ts"),
  },
];

const CODE: [string, string][] = [
  ["The escrow contract", "contracts/encroe-escrow/src/lib.rs"],
  ["The factory and directory", "contracts/encroe-factory/src/lib.rs"],
  ["The verifier the enclave runs", "crates/encore-verifier/src/lib.rs"],
  ["Sealing: CKD identity, IBE, the package, player leaves", "crates/encore-crypto/src"],
  ["Game cores in Rust, C++, C, Zig and Go, and their interface", "cores/README.md"],
  ["Bringing a game back, in the browser", "web/lib/encroe/revive.ts"],
  ["Sealing in the browser", "web/lib/encroe/seal.ts"],
  ["The item handover on NEAR, and its token on Base", "contracts/encroe-items/src/lib.rs"],
  ["The preservation agent and the MCP server", "web/lib/encroe/agent.ts"],
  ["The studio's bot", "scripts/studio/bot.sh"],
];

export default async function JudgesPage() {
  const target = await killTarget();
  const kill = target ? `/revive?escrow=${target.escrow}` : "/escrows";
  const PATH = [
    {
      n: "1",
      title: "Play",
      href: "/play/embergate",
      cta: "Enter Embergate",
      tone: "bg-ember",
      body: "Enter a name, gather, forge a Lantern. Your browser makes a key and signs every move; every rule runs in the one wasm core the studio seals.",
    },
    {
      n: "2",
      title: "Check the vault",
      href: "/play/embergate",
      cta: "Is my stuff in there?",
      tone: "bg-acid",
      body: "Press Check. Your browser fetches your proof and verifies it against the root it reads from NEAR itself. (If you joined after the last seal, it says so: the studio re-seals every six hours.)",
    },
    {
      n: "3",
      title: "Kill a studio",
      href: kill,
      cta: "Release a silent studio",
      tone: "bg-flare",
      body: "This studio sealed its world, got it verified green, then stopped its heartbeat. Press Release it: a real NEAR transaction the contract alone allows.",
    },
    {
      n: "4",
      title: "Bring it back",
      href: kill,
      cta: "Watch the eight checks",
      tone: "bg-gold",
      body: "The page rebuilds the game from NEAR and FastFS alone: the release's signature, the package's hash, the decryption, the core, every player's items, a boot with zero imports.",
    },
    {
      n: "5",
      title: "Play on",
      href: "/revive?escrow=encroe-matchday-5d60.testnet",
      cta: "Revive the C++ game",
      tone: "bg-ember",
      body: "Press Play on. The same game, run by your browser on the core that came out of the escrow. Try the C++ football club or the C city too.",
    },
    {
      n: "6",
      title: "Try to break it",
      href: "/break",
      cta: "Cheat the escrow",
      tone: "bg-flare",
      body: "Six real attacks on live, locked escrows: early release, fake heartbeat, fake seal, tampered build, replayed quote, double release. Each refused on chain.",
    },
  ];
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-acid uppercase">For judges</p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Five minutes. All live. <span className="text-acid">Nothing mocked.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        Everything below runs on NEAR testnet with real transactions. Where a run simulates something (a studio going
        silent, scripted test players), it says so.
      </p>

      <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PATH.map((s) => (
          <li key={s.n} className="flex flex-col rounded-xl border border-line bg-panel p-6">
            <span className="font-display text-5xl font-black text-ink-3">{s.n}</span>
            <h2 className="mt-3 font-display text-h2 font-black">{s.title}</h2>
            <p className="mt-2 flex-1 text-sm text-ink-2">{s.body}</p>
            <Link
              href={s.href}
              className={`mt-5 w-fit rounded-md px-4 py-2.5 font-display text-xs font-bold tracking-wide text-void uppercase ${s.tone}`}
            >
              {s.cta} →
            </Link>
          </li>
        ))}
      </ol>

      <section className="mt-20" aria-labelledby="claims">
        <h2 id="claims" className="font-display text-h1 font-black">
          Every claim, and where it is proven
        </h2>
        <div className="mt-6 overflow-hidden rounded-xl border border-line">
          {CLAIMS.map((c, i) => (
            <a
              key={c.claim}
              href={c.href}
              className={`grid gap-1 px-5 py-4 transition hover:bg-panel-2 md:grid-cols-[1.6fr_1fr] md:gap-6 ${i % 2 ? "bg-panel" : "bg-night"}`}
            >
              <span className="text-sm text-ink">{c.claim}</span>
              <span className="font-mono text-xs text-acid">{c.evidence} →</span>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-20 grid gap-6 lg:grid-cols-2" aria-label="Check it without us">
        <div className="rounded-xl border border-line bg-panel p-6">
          <h2 className="font-display text-h2 font-black">Check it without our site</h2>
          <p className="mt-2 text-sm text-ink-2">Any escrow&rsquo;s state and its keys, straight from NEAR:</p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-night p-4 font-mono text-[11px] text-ink-2">{`curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{
    "request_type":"call_function","finality":"final",
    "account_id":"encroe-embergate.testnet",
    "method_name":"status","args_base64":"e30="}}'

# from the repository
make test                    # Rust: CKD vectors, IBE, verifier, the escrow, the factory
cd web && npm ci && npm test # the browser code against real released data`}</pre>
        </div>
        <div className="rounded-xl border border-gold/40 bg-panel p-6">
          <h2 className="font-display text-h2 font-black">Or ask your own AI</h2>
          <p className="mt-2 text-sm text-ink-2">
            The site is also an MCP server: list escrows, inspect one, release a silent studio&rsquo;s game, bring a
            released game back with every check.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-night p-4 font-mono text-[11px] text-gold">
            claude mcp add --transport http encroe https://encroe.vercel.app/api/mcp
          </pre>
          <Link href="/agent" className="mt-4 inline-block text-sm text-gold underline underline-offset-4">
            The preservation agent&rsquo;s log
          </Link>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="code">
        <h2 id="code" className="font-display text-h1 font-black">
          Where to look in the code
        </h2>
        <ul className="mt-6 grid gap-2 md:grid-cols-2">
          {CODE.map(([what, path]) => (
            <li key={path}>
              <a
                href={doc(path)}
                className="flex justify-between gap-4 rounded-md border border-line bg-panel px-4 py-3 hover:border-line-strong"
              >
                <span className="text-sm">{what}</span>
                <span className="truncate font-mono text-xs text-ink-3">{path}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20 rounded-xl border border-dashed border-line-strong p-6" aria-labelledby="disclose">
        <h2 id="disclose" className="font-display text-h2 font-black">
          What we disclose
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>Testnet only. No mainnet transaction was sent.</li>
          <li>
            In every recorded release, we stopped the studio&rsquo;s heartbeat ourselves: the only way to show a studio
            disappearing on demand. The contract cannot tell the difference, which is the point.
          </li>
          <li>The sealed worlds hold players we played by hand and players scripted through the same signed moves.</li>
          <li>
            The enclave is OutLayer&rsquo;s; its operators are not trusted: a run counts only after NEAR&rsquo;s own
            DCAP verifier accepts its quote.
          </li>
          <li>
            A world holds 64 players. A revived world runs in each player&rsquo;s browser; shared hosting, paid on
            proof, is designed, not built.
          </li>
          <li>
            Item claims were relayed to Base Sepolia from a testnet account of the author&rsquo;s other project
            (Klear&rsquo;s); anyone can relay one, since the token checks the MPC signature, not the sender.
          </li>
        </ul>
        <a href={doc("JUDGES.md")} className="mt-4 inline-block text-sm text-acid underline underline-offset-4">
          JUDGES.md, with every transaction
        </a>
      </section>
    </main>
  );
}
