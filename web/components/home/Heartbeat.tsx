/**
 * The whole idea in one line: the studio's heartbeat, then silence, then the game lighting up again on its own.
 * Decorative; the words around it say the same.
 */
export function Heartbeat() {
  const beat = "M0 80 H140 l14 -46 l16 92 l14 -64 l10 18 H330 l14 -46 l16 92 l14 -64 l10 18 H520";
  return (
    <svg viewBox="0 0 1200 160" className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="reignite" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-flare)" />
          <stop offset="0.55" stopColor="var(--color-ember)" />
          <stop offset="1" stopColor="var(--color-acid)" />
        </linearGradient>
      </defs>
      <path d={beat} fill="none" stroke="var(--color-ink-3)" strokeWidth="3" className="animate-trace" pathLength={1} />
      <path
        d="M520 80 H860"
        fill="none"
        stroke="var(--color-flare)"
        strokeWidth="3"
        strokeDasharray="6 10"
        className="animate-appear [animation-delay:0.9s]"
      />
      <path
        d="M860 80 l18 -62 l20 124 l18 -96 l16 34 H960 l18 -62 l20 124 l18 -96 l16 34 H1200"
        fill="none"
        stroke="url(#reignite)"
        strokeWidth="5"
        strokeLinejoin="round"
        className="animate-trace [animation-delay:1.7s]"
        pathLength={1}
      />
      <text
        x="690"
        y="62"
        textAnchor="middle"
        className="animate-appear fill-flare font-mono text-[15px] tracking-[0.3em] [animation-delay:1.1s]"
      >
        THE STUDIO GOES SILENT
      </text>
    </svg>
  );
}
