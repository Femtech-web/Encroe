import { ITEMS, type ItemId } from "@/lib/game/items";

/** One mark per item, drawn on a 24-unit grid in the item's own colour. */
const PATHS: Record<ItemId, React.ReactNode> = {
  1: <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 2-6 1-10z" />,
  2: <path d="M12 2 21 7v10l-9 5-9-5V7z M12 2v20 M3 7l9 5 9-5" fill="none" strokeWidth="1.6" />,
  3: <path d="M12 1 19 9 12 23 5 9z M5 9h14 M9 9l3 14 3-14" fill="none" strokeWidth="1.5" />,
  4: (
    <g>
      <rect x="3" y="5" width="18" height="4" rx="2" />
      <rect x="3" y="10.5" width="18" height="4" rx="2" opacity=".75" />
      <rect x="3" y="16" width="18" height="4" rx="2" opacity=".5" />
    </g>
  ),
  5: <path d="M16 3a9 9 0 1 0 5 15A8 8 0 0 1 16 3z" />,
  6: (
    <g>
      <circle cx="7" cy="16" r="3" />
      <circle cx="14" cy="18" r="2.4" opacity=".8" />
      <circle cx="17" cy="11" r="1.8" opacity=".6" />
      <circle cx="10" cy="9" r="1.4" opacity=".45" />
      <circle cx="13" cy="4" r="1" opacity=".3" />
    </g>
  ),
  9: (
    <g>
      <path d="M9 3h6M12 3v2M7 7h10l-1 12H8z" fill="none" strokeWidth="1.6" />
      <path d="M12 10c1 2 2 3 2 5a2 2 0 0 1-4 0c0-2 1-3 2-5z" />
    </g>
  ),
  10: <path d="M12 1 15 5v11h-6V5z M6 16h12v2H6z M11 18h2v5h-2z" />,
  11: <path d="M12 2 22 20H2z M12 2v18 M2 20l10-6 10 6" fill="none" strokeWidth="1.5" />,
  12: <path d="M5 2c10 3 10 17 0 20 M5 2v20 M2 12h17 M16 9l3 3-3 3" fill="none" strokeWidth="1.6" />,
  13: <path d="M2 8l5 4 5-8 5 8 5-4-2 12H4z M5 22h14" />,
  14: <path d="M12 3c2 3 2 6 0 9 3-2 7-2 10-1-3 1-6 3-7 6l-3 5-3-5c-1-3-4-5-7-6 3-1 7-1 10 1-2-3-2-6 0-9z" />,
};

export function Glyph({ id, size = 24, className }: { id: number; size?: number; className?: string }) {
  if (!(id in ITEMS)) return null;
  const item = ITEMS[id as ItemId];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={item.color}
      stroke={item.color}
      strokeWidth="0"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {PATHS[id as ItemId]}
    </svg>
  );
}
