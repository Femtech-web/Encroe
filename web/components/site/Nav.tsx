import Link from "next/link";
import { REPO } from "@/lib/encroe/escrows";

export function Nav() {
  return (
    <nav aria-label="Main" className="mx-auto flex max-w-page items-center justify-between gap-4 px-5 py-5">
      <Link href="/" className="font-display text-lg font-black tracking-tight">
        ENCROE<span className="text-ember">.</span>
      </Link>
      <div className="flex items-center gap-1 text-sm sm:gap-2">
        <Link href="/play" className="rounded-sm px-2.5 py-1.5 text-ink-2 hover:text-ember">
          Play
        </Link>
        <Link href="/revive" className="rounded-sm px-2.5 py-1.5 text-ink-2 hover:text-acid">
          Bring it back
        </Link>
        <Link href="/#proof" className="hidden rounded-sm px-2.5 py-1.5 text-ink-2 hover:text-ink sm:inline">
          Proof
        </Link>
        <a href={REPO} className="hidden rounded-sm px-2.5 py-1.5 text-ink-2 hover:text-ink sm:inline">
          GitHub
        </a>
      </div>
    </nav>
  );
}
