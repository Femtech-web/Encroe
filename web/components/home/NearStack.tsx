/** The NEAR pieces Encroe stands on, each with the account it talks to and the job it does. */
const STACK = [
  {
    name: "MPC network",
    account: "v1.signer-prod.testnet",
    role: "The key",
    body: "Derives a key for each escrow's own identity (confidential key derivation, domain 2) and publishes it only when that contract asks. Before the release, nobody holds it: not the studio, not us.",
    tone: "text-acid",
  },
  {
    name: "Chain Signatures",
    account: "encroe-items · domain 0",
    role: "The handover",
    body: "The same MPC network signs for a keyless contract on other chains. After a release, it signs each player's claim to their own sealed items, once, and a token contract on Base Sepolia mints exactly that.",
    tone: "text-acid",
  },
  {
    name: "DCAP verifier",
    account: "tee-verifier-2026-07-22.testnet",
    role: "The proof",
    body: "Checks Intel TDX quotes on chain. The escrow accepts an enclave's verdict only after this contract verifies its quote, bound to that exact run.",
    tone: "text-acid",
  },
  {
    name: "Keyless accounts",
    account: "0 access keys",
    role: "The rules",
    body: "An account with no keys can never change its code. The factory creates every escrow without one, so the release condition it is born with is the one it dies with.",
    tone: "text-ember",
  },
  {
    name: "NEAR Connect",
    account: "the studio's wallet",
    role: "The studio",
    body: "A studio creates its escrow, seals its world, heartbeats and ends service from its own wallet, in the browser. Its package key leaves the tab only encrypted to the enclave's keystore.",
    tone: "text-gold",
  },
  {
    name: "OutLayer",
    account: "outlayer.testnet",
    role: "The enclave",
    body: "Runs the pinned verifier inside Intel TDX, with the studio's sealed key row readable only by that build, for that escrow. Its operators are not trusted: NEAR checks the hardware.",
    tone: "text-ember",
  },
  {
    name: "FastFS",
    account: "test.fastfs.io",
    role: "The package",
    body: "The sealed game lives on NEAR itself, as transaction data. Bringing a game back needs no studio server: the hash NEAR holds decides what is real.",
    tone: "text-gold",
  },
  {
    name: "Promises and callbacks",
    account: "yield · resume",
    role: "The wait",
    body: "One release transaction asks the MPC network and hears back; one verify asks OutLayer and hears back. The contract keeps the answer, so the state on chain is the story.",
    tone: "text-gold",
  },
];

export function NearStack() {
  return (
    <section className="mx-auto mt-28 max-w-page px-5" aria-labelledby="near">
      <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase">How NEAR makes this possible</p>
      <h2 id="near" className="mt-4 max-w-4xl font-display text-h1 font-black">
        A key nobody holds, a proof nobody fakes, rules nobody changes, items nobody locks in.
      </h2>
      <p className="mt-4 max-w-2xl text-ink-2">
        Every piece of the promise is a NEAR primitive. Take one away and the escrow needs someone to trust again. The
        same network that releases a game signs its players&rsquo; items onto another chain.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STACK.map((s) => (
          <article key={s.name} className="flex flex-col rounded-xl border border-line bg-panel p-6">
            <p className={`font-mono text-xs tracking-[0.25em] uppercase ${s.tone}`}>{s.role}</p>
            <h3 className="mt-3 font-display text-h2 font-black">{s.name}</h3>
            <p className="mt-1 font-mono text-[11px] text-ink-3">{s.account}</p>
            <p className="mt-3 text-sm text-ink-2">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
