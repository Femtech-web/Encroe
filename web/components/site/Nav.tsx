import Link from "next/link";

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
        <Link href="/studios" className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-gold sm:inline">
          Studios
        </Link>
        <Link href="/tools" className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-acid md:inline">
          Tools
        </Link>
        <Link href="/escrows" className="rounded-sm px-2 py-1.5 text-ink-2 hover:text-acid">
          Escrows
        </Link>
        <Link href="/revive" className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-acid lg:inline">
          Bring it back
        </Link>
        <Link href="/agent" className="hidden rounded-sm px-2 py-1.5 text-ink-2 hover:text-acid lg:inline">
          Agent
        </Link>
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-line-strong sm:inline-block" />
        <Link href="/proof" className="rounded-sm px-2 py-1.5 text-ink-2 hover:text-flare">
          Proof
        </Link>
        <Link
          href="/judges"
          className="rounded-sm border border-line px-2.5 py-1.5 text-ink hover:border-acid hover:text-acid"
        >
          Judges
        </Link>
      </div>
    </nav>
  );
}
