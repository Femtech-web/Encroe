import type { Metadata } from "next";
import Link from "next/link";
import { GAMES, GAME_IDS } from "@/lib/game/games";
import { readWorld } from "@/lib/game/server";

export const metadata: Metadata = {
  title: "Play",
  description: "Three games, three languages, every rule in a sealed server core. Pick one and play.",
};

export default async function PlayPage() {
  const worlds = await Promise.all(GAME_IDS.map((g) => readWorld(g).catch(() => null)));
  return (
    <main className="mx-auto max-w-page px-5 pt-10 pb-24">
      <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase">Play</p>
      <h1 className="mt-5 max-w-4xl font-display text-hero font-black tracking-tight">
        Pick a world. <span className="text-ember">It can&rsquo;t be switched off.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        Three games in three languages. In each, every rule runs in one sealed WebAssembly core, and every move is
        signed by a key your browser makes and keeps.
      </p>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {GAME_IDS.map((id, i) => {
          const g = GAMES[id];
          return (
            <Link
              key={id}
              href={`/play/${id}`}
              className="group flex min-h-80 flex-col rounded-xl border border-line bg-panel p-7 transition hover:-translate-y-0.5 hover:border-line-strong"
            >
              <p className={`font-mono text-xs tracking-[0.25em] uppercase ${g.tone}`}>{g.language}</p>
              <h2 className="mt-3 font-display text-4xl font-black">{g.name}</h2>
              <p className="mt-1 text-sm text-ink-3">{g.genre}</p>
              <p className="mt-4 flex-1 text-ink-2">{g.blurb}</p>
              <p className="mt-6 font-mono text-xs text-ink-3">
                {worlds[i]?.players.length ?? 0}/64 players ·{" "}
                {g.escrow ? `sealed into ${g.escrow}` : "world not sealed yet"}
              </p>
              <span className={`mt-4 font-display text-sm font-bold uppercase ${g.tone}`}>Play {g.name} →</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
