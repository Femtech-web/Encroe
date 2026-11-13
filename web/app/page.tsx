import Link from "next/link";
import { Heartbeat } from "@/components/home/Heartbeat";
import { REPO, killTarget, liveEscrows, type Live } from "@/lib/encroe/escrows";
import type { EscrowStatus } from "@/lib/game/near";
import { readWorld } from "@/lib/game/server";

const STEPS = [
  {
    n: "01",
    title: "Seal",
    body: "The studio seals its server core and every player's items, encrypted to a key that exists only inside NEAR's MPC network. Not the studio's, not ours.",
    tag: "NEAR MPC · key derivation",
  },
  {
    n: "02",
    title: "Verify it, unopened",
    body: "An Intel TDX enclave decrypts the sealed build, runs it, and checks it serves every sampled player exactly. NEAR's own DCAP verifier checks the enclave before the contract believes it. A broken build turns the badge red.",
    tag: "TDX · NEAR DCAP verifier",
  },
  {
    n: "03",
    title: "Check your own items",
    body: "Each player proves their items are inside, against the root NEAR holds, without revealing anyone else's. Their browser does the checking.",
    tag: "salted Merkle root",
  },
  {
    n: "04",
    title: "The heartbeat",
    body: "The studio keeps signing in. If it goes silent past its grace period, anyone (a player, a fan, an agent) can release the escrow. The contract has no keys: nobody can stop it or move it early.",
    tag: "a keyless contract",
  },
  {
    n: "05",
    title: "The game comes back",
    body: "NEAR's MPC network publishes the key. Anyone takes the package from NEAR, checks every hash against what the enclave verified, and runs the server, with everyone's items intact.",
    tag: "FastFS · your browser",
  },
];

const BADGE: Record<EscrowStatus["badge"], string> = {
  green: "text-acid",
  "awaiting-proof": "text-gold",
  pending: "text-gold",
  unverified: "text-ink-3",
  unsealed: "text-ink-3",
  red: "text-flare",
};

export default async function Home() {
  const [escrows, target, world] = await Promise.all([liveEscrows(), killTarget(), readWorld().catch(() => null)]);
  const killHref = target ? `/revive?escrow=${target.escrow}` : "/revive";
  const released = escrows.filter((e) => e.status?.phase === "released").length;

  return (
    <main>
      <section className="mx-auto max-w-page px-5 pt-10 pb-6 sm:pt-16">
        <p className="animate-rise font-mono text-xs tracking-[0.3em] text-ember uppercase">
          Encroe · a game escrow on NEAR
        </p>
        <h1 className="mt-6 animate-rise font-display text-hero font-black tracking-tight [animation-delay:80ms]">
          The studio shut down.
          <br />
          <span className="text-acid">The game didn&rsquo;t.</span>
        </h1>
        <p className="mt-8 max-w-2xl animate-rise text-lg text-ink-2 [animation-delay:160ms] sm:text-xl">
          A studio seals its game server into a NEAR contract that has no keys. While the studio lives, anyone can check
          the sealed build is real. If it goes silent, anyone can release it, and the game goes to its players with
          everything they earned.
        </p>
        <div className="mt-10 flex animate-rise flex-wrap gap-3 [animation-delay:240ms]">
          <Link
            href="/play"
            className="rounded-md bg-ember px-7 py-4 font-display font-bold tracking-wide text-void uppercase transition hover:shadow-ember"
          >
            Play Embergate
          </Link>
          <Link
            href={killHref}
            className="rounded-md border-2 border-flare px-7 py-4 font-display font-bold tracking-wide text-flare uppercase transition hover:bg-flare hover:text-void"
          >
            Kill a studio →
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-page px-5">
        <Heartbeat />
      </div>

      <section aria-label="Live on NEAR testnet" className="mx-auto max-w-page px-5">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          <Stat
            label="escrows on this page, all locked"
            value={`${escrows.filter((e) => e.keys === 0).length}/${escrows.length}`}
            note="0 access keys each"
          />
          <Stat label="released by strangers" value={String(released)} note="a stranger's or a visitor's click" />
          <Stat
            label="players in Embergate"
            value={world ? String(world.players.length) : "–"}
            note="max 64 per world"
          />
          <Stat label="mocked transactions" value="0" note="every claim links to NEAR" />
        </dl>
      </section>

      <section className="mx-auto mt-28 max-w-page px-5" aria-labelledby="problem">
        <p className="font-mono text-xs tracking-[0.3em] text-flare uppercase">The problem</p>
        <h2 id="problem" className="mt-4 max-w-4xl font-display text-h1 font-black">
          Every online game has a kill switch. Only the studio holds it.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact big="2024" text="The Crew's servers went dark, and the game people paid for went with them." />
          <Fact big="Jan 2026" text="Anthem's servers shut for good, and everything its players earned with them." />
          <Fact big="1.29M" text="Europeans signed the Stop Killing Games initiative." />
          <Fact
            big="Declined"
            text="The EU declined to legislate. An end-of-life promise cannot be enforced: when it matters, the studio is gone."
          />
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-page px-5" aria-labelledby="how">
        <p className="font-mono text-xs tracking-[0.3em] text-acid uppercase">The answer</p>
        <h2 id="how" className="mt-4 max-w-4xl font-display text-h1 font-black">
          Make &ldquo;the game will outlive us&rdquo; a promise nobody can break.
        </h2>
        <ol className="mt-10 grid gap-4 lg:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col rounded-lg border border-line bg-panel p-5">
              <span className="font-display text-3xl font-black text-ember">{s.n}</span>
              <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm text-ink-2">{s.body}</p>
              <p className="mt-4 font-mono text-[11px] tracking-wide text-acid uppercase">{s.tag}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 font-display text-lg font-bold text-ink-2">
          No lawyer, no escrow agent, no permission, no key anyone holds.
        </p>
      </section>

      <section className="mx-auto mt-28 max-w-page px-5" aria-labelledby="acts">
        <p className="font-mono text-xs tracking-[0.3em] text-gold uppercase">Try it yourself</p>
        <h2 id="acts" className="mt-4 font-display text-h1 font-black">
          Four acts. Five minutes. All real.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Act
            n="I"
            title="Play"
            tone="ember"
            href="/play"
            cta="Enter Embergate"
            body="Gather from six nodes, forge relics, chase the Phoenix. Every move is signed by a key your browser makes, and every rule runs in the one server core the studio seals."
          />
          <Act
            n="II"
            title="Check the vault"
            tone="acid"
            href="/play"
            cta="Is my stuff in there?"
            body="Once the studio seals an epoch, ask whether your items are inside. Your browser reads the root from NEAR and checks your proof itself."
          />
          <Act
            n="III"
            title="Kill the studio"
            tone="flare"
            href={killHref}
            cta={target?.fresh ? "Release a silent studio" : "See a killed studio"}
            body="A studio here has gone silent. Release its escrow: one click, a real NEAR transaction, nobody's permission. The contract checks the silence, not us."
          />
          <Act
            n="IV"
            title="Bring it back"
            tone="gold"
            href="/revive"
            cta="Bring a game back"
            body="Watch your browser rebuild the game from NEAR alone: eight checks, from the key's signature to every player's items. Then play on, with no server at all."
          />
        </div>
      </section>

      <section id="proof" className="mx-auto mt-28 max-w-page scroll-mt-8 px-5" aria-labelledby="proof-title">
        <p className="font-mono text-xs tracking-[0.3em] text-acid uppercase">Don&rsquo;t trust this page</p>
        <h2 id="proof-title" className="mt-4 font-display text-h1 font-black">
          Read it from NEAR, right now.
        </h2>
        <p className="mt-4 max-w-2xl text-ink-2">
          Each row is the escrow&rsquo;s own <span className="font-mono text-sm">status()</span> and its access keys,
          read from NEAR testnet as this page loaded. Each run, every transaction, is written up in the repository.
        </p>
        <div className="mt-8 space-y-3">
          {escrows.map((e) => (
            <EscrowRow key={e.id} e={e} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-page px-5" aria-labelledby="why">
        <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase">Why only NEAR</p>
        <h2 id="why" className="mt-4 font-display text-h1 font-black">
          Three things this needs, all native to NEAR.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Pillar
            title="The key"
            body="NEAR's MPC network derives a key for this contract's identity and releases it only when the contract asks. Before that, nobody holds it."
          />
          <Pillar
            title="The proof"
            body="NEAR's DCAP verifier checks Intel TDX quotes on chain, so the contract trusts the hardware, not an operator."
          />
          <Pillar
            title="The rules"
            body="A contract with no access keys is final. The release condition it was born with is the one it dies with."
          />
        </div>
      </section>

      <footer className="mx-auto mt-32 max-w-page border-t border-line px-5 py-14">
        <p className="font-display text-h2 font-black">
          The studio shut down. <span className="text-acid">The game didn&rsquo;t.</span>
        </p>
        <p className="mt-6 max-w-3xl text-sm text-ink-3">
          NEAR testnet. In the recorded runs the studio&rsquo;s silence is simulated (we stop its heartbeat) and some
          players are scripted test players; each run says so. Every transaction is real.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <a href={REPO} className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            Source and evidence
          </a>
          <a
            href={`${REPO}/blob/main/JUDGES.md`}
            className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            For judges
          </a>
          <a
            href={`${REPO}/blob/main/docs/thesis.md`}
            className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            The thesis
          </a>
        </div>
      </footer>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-night p-5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-2 font-display text-3xl font-black">{value}</dd>
      <dd className="mt-1 font-mono text-[11px] text-ink-3">{note}</dd>
    </div>
  );
}

function Fact({ big, text }: { big: string; text: string }) {
  return (
    <div className="rounded-lg border border-flare/25 bg-flare-soft p-5">
      <p className="font-display text-4xl font-black text-flare">{big}</p>
      <p className="mt-3 text-sm text-ink-2">{text}</p>
    </div>
  );
}

const TONES = {
  ember: { text: "text-ember", border: "hover:border-ember", button: "bg-ember" },
  acid: { text: "text-acid", border: "hover:border-acid", button: "bg-acid" },
  flare: { text: "text-flare", border: "hover:border-flare", button: "bg-flare" },
  gold: { text: "text-gold", border: "hover:border-gold", button: "bg-gold" },
};

function Act(props: { n: string; title: string; tone: keyof typeof TONES; href: string; cta: string; body: string }) {
  const t = TONES[props.tone];
  return (
    <Link
      href={props.href}
      className={`group relative flex min-h-64 flex-col overflow-hidden rounded-xl border border-line bg-panel p-7 transition ${t.border}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute top-4 right-6 font-display text-[6.5rem] leading-none font-black opacity-15 ${t.text}`}
      >
        {props.n}
      </span>
      <h3 className={`font-display text-h2 font-black ${t.text}`}>{props.title}</h3>
      <p className="mt-3 max-w-md flex-1 text-ink-2">{props.body}</p>
      <span
        className={`mt-6 inline-flex w-fit rounded-md px-4 py-2.5 font-display text-xs font-bold tracking-wide text-void uppercase ${t.button}`}
      >
        {props.cta} →
      </span>
    </Link>
  );
}

function EscrowRow({ e }: { e: Live }) {
  const s = e.status;
  return (
    <div className="grid gap-3 rounded-lg border border-line bg-panel p-5 md:grid-cols-[1.4fr_2fr_auto] md:items-center">
      <div className="min-w-0">
        <a
          href={`https://testnet.nearblocks.io/address/${e.id}`}
          className="block truncate font-mono text-sm text-ink hover:text-acid"
        >
          {e.id}
        </a>
        <p className="mt-1 font-mono text-xs text-ink-3">
          {e.keys === null ? "keys: unknown" : `${e.keys} access keys`}
          {s?.epoch ? ` · epoch ${s.epoch}` : ""}
        </p>
      </div>
      <p className="text-sm text-ink-2">{e.story}</p>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {s ? (
          <>
            <span className="rounded-sm border border-line px-2 py-1 font-mono text-xs">{s.phase}</span>
            <span className={`rounded-sm border border-line px-2 py-1 font-mono text-xs ${BADGE[s.badge]}`}>
              {s.badge}
            </span>
          </>
        ) : (
          <span className="font-mono text-xs text-ink-3">could not read NEAR</span>
        )}
        <a
          href={`${REPO}/tree/main/docs/results/escrow/${e.results}`}
          className="rounded-sm px-2 py-1 text-xs text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          the run
        </a>
      </div>
    </div>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-6">
      <h3 className="font-display text-h2 font-black text-ember">{title}</h3>
      <p className="mt-3 text-ink-2">{body}</p>
    </div>
  );
}
