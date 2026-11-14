import Link from "next/link";
import { REPO } from "@/lib/encroe/escrows";

export function Nav() {
  return (
    <nav aria-label="Main" className="mx-auto flex max-w-page items-center justify-between gap-4 px-5 py-5">
      <Link href="/" className="font-display text-lg font-black tracking-tight">
        ENCROE<span className="text-ember">.</span>
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-x-1 text-sm sm:gap-x-2">
        <Link href="/play" className="rounded-sm px-2 py-1.5 text-ink-2 hover:text-ember">
          Play
        </Link>
        <Link href="/escrows" className="rounded-sm px-2 py-1.5 text-ink-2 hover:text-acid">
          Escrows
        </Link>
        <Link href="/studios" className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-gold sm:inline">
          Studios
        </Link>
        <Link href="/break" className="rounded-sm px-2 py-1.5 text-ink-2 hover:text-flare">
          Break it
        </Link>
        <Link href="/revive" className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-acid md:inline">
          Bring it back
        </Link>
        <Link href="/agent" className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-acid lg:inline">
          Agent
        </Link>
        <Link
          href="/judges"
          className="rounded-sm border border-line px-2.5 py-1.5 text-ink hover:border-acid hover:text-acid"
        >
          Judges
        </Link>
        <a href={REPO} className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-ink lg:inline">
          GitHub
        </a>
      </div>
    </nav>
  );
}
