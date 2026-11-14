import type { EscrowStatus } from "@/lib/game/near";

const PHASE: Record<EscrowStatus["phase"], { label: string; tone: string }> = {
  live: { label: "Studio alive", tone: "border-acid/50 text-acid" },
  ending: { label: "End of life declared", tone: "border-gold/50 text-gold" },
  silent: { label: "Studio silent", tone: "border-flare/60 text-flare" },
  releasing: { label: "Releasing", tone: "border-gold/50 text-gold" },
  released: { label: "Released to players", tone: "border-ember/60 text-ember" },
};

const BADGE: Record<EscrowStatus["badge"], { label: string; tone: string }> = {
  green: { label: "Verified: enclave + NEAR DCAP", tone: "bg-acid-soft text-acid" },
  "awaiting-proof": { label: "Enclave passed, quote pending", tone: "bg-gold-soft text-gold" },
  pending: { label: "Verification running", tone: "bg-gold-soft text-gold" },
  unverified: { label: "Not verified yet", tone: "bg-night text-ink-3" },
  unsealed: { label: "Nothing sealed", tone: "bg-night text-ink-3" },
  red: { label: "Failed verification", tone: "bg-flare-soft text-flare" },
};

export function PhaseBadge({ phase }: { phase: EscrowStatus["phase"] }) {
  const p = PHASE[phase];
  return <span className={`rounded-sm border px-2 py-1 font-mono text-xs ${p.tone}`}>{p.label}</span>;
}

export function VerifyBadge({ badge }: { badge: EscrowStatus["badge"] }) {
  const b = BADGE[badge];
  return <span className={`rounded-sm px-2 py-1 font-mono text-xs ${b.tone}`}>{b.label}</span>;
}
