import type { Metadata } from "next";
import Link from "next/link";
import { PhaseBadge, VerifyBadge } from "@/components/escrow/Badges";
import { FACTORY, clock, directory, type Origin } from "@/lib/encroe/directory";

export const metadata: Metadata = {
  title: "The directory",
  description:
    "Every Encroe escrow, read live from NEAR: whose game it holds, whether it is verified, and how long its heartbeat holds.",
};

const ORIGIN: Record<Origin, string> = {
  factory: "made by a studio, through the factory",
  ours: "a recorded run",
  pool: "a silent studio, left for visitors",
};

export default async function EscrowsPage() {
  const rows = await directory();
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-acid uppercase">The directory</p>
      <h1 className="mt-5 font-display text-h1 font-black">Every escrow, read from NEAR.</h1>
      <p className="mt-4 max-w-2xl text-ink-2">
        Studios create escrows through the factory at <span className="font-mono text-sm">{FACTORY}</span>, which lists
        every one it makes. Below them, the escrows of our recorded runs. Each row is the escrow&rsquo;s own state as
        this page loaded.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/studios"
          className="rounded-md bg-acid px-5 py-3 font-display text-xs font-bold tracking-wide text-void uppercase"
        >
          Create one for your game
        </Link>
      </div>

      <ul className="mt-10 space-y-3">
        {rows.map((r) => {
          const c = r.state?.commitment;
          const t = r.status ? clock(r.status) : null;
          return (
            <li key={r.id}>
              <Link
                href={`/escrow/${r.id}`}
                className="grid gap-3 rounded-lg border border-line bg-panel p-5 transition hover:border-line-strong md:grid-cols-[1.3fr_1fr_1.2fr] md:items-center"
              >
                <div className="min-w-0">
                  <p className="font-display font-bold">
                    {r.catalog?.game ?? r.listing?.game ?? c?.game ?? "Unsealed"}
                    {r.catalog && <span className="ml-2 font-mono text-xs text-gold">{r.catalog.language}</span>}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-ink-3">{r.id}</p>
                  <p className="mt-1 text-xs text-ink-3">{r.note ?? ORIGIN[r.origin]}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.status ? (
                    <>
                      <PhaseBadge phase={r.status.phase} />
                      <VerifyBadge badge={r.status.badge} />
                    </>
                  ) : (
                    <span className="font-mono text-xs text-ink-3">could not read NEAR</span>
                  )}
                </div>
                <div className="text-sm text-ink-2 md:text-right">
                  {c && (
                    <p className="font-mono text-xs text-ink-3">
                      epoch {c.epoch} · {c.players} players
                    </p>
                  )}
                  {t && (
                    <p
                      className={
                        t.tone === "silent" ? "text-flare" : t.tone === "released" ? "text-ember" : "text-acid"
                      }
                    >
                      {t.text}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
