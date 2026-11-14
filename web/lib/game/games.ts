/** The games this site hosts live: each a sealed core, a language, and (once sealed) its public world's escrow. */
export type GameId = "embergate" | "matchday" | "neon-city" | "starhaul" | "orchard";

export type GameInfo = {
  id: GameId;
  name: string;
  language: string;
  genre: string;
  blurb: string;
  /** web/public/core/<file> */
  file: string;
  sha256: string;
  /** Tailwind text color class for its accents. */
  tone: string;
  /** The escrow its public world is sealed into, once there is one. */
  escrow?: string;
};

export const GAMES: Record<GameId, GameInfo> = {
  embergate: {
    id: "embergate",
    name: "Embergate",
    language: "Rust",
    genre: "a crafting world",
    blurb: "Gather from six nodes, forge relics up to the Phoenix, trade with other players.",
    file: "embergate.wasm",
    sha256: "49ff0c57f10f24b9091eae3bd218b28a642d581f698871f6b3c65b7effa9cb62",
    tone: "text-ember",
    escrow: "encroe-embergate.testnet",
  },
  matchday: {
    id: "matchday",
    name: "Matchday",
    language: "C++",
    genre: "a football card club",
    blurb: "Open packs, build a squad of rated cards, play matches for coins and trophies, trade on the market.",
    file: "matchday.wasm",
    sha256: "f149751774f754b956636225c79d294494e1b5dc2c523867eeb2d5b3f96dba4a",
    tone: "text-gold",
    escrow: "matchday.encroe.testnet",
  },
  "neon-city": {
    id: "neon-city",
    name: "Neon City",
    language: "C",
    genre: "an open-world city economy",
    blurb: "Work jobs from deliveries to heists, buy vehicles and property, earn respect.",
    file: "neon-city.wasm",
    sha256: "3f4a1e626aa6fc2e819aaaf5e3ee718e0e6307de87d47c895a93addb336bb3d2",
    tone: "text-flare",
    escrow: "neon-city.encroe.testnet",
  },
  starhaul: {
    id: "starhaul",
    name: "Starhaul",
    language: "Zig",
    genre: "a space freight economy",
    blurb: "Mine asteroid belts, refine ore into alloy, fly contracts, and buy ships that reach richer belts.",
    file: "starhaul.wasm",
    sha256: "f8a50a172e7da0c34c64c08443194d9e737da720749d31b775ada99ad64c463e",
    tone: "text-acid",
    escrow: "starhaul.encroe.testnet",
  },
  orchard: {
    id: "orchard",
    name: "Orchard",
    language: "Go",
    genre: "a farm and county fair",
    blurb: "Tend apple trees, pears and hives, press cider and make jam, and win ribbons at the county fair.",
    file: "orchard.wasm",
    sha256: "91665f535afb63e4f9c86a5cd33eefde9eac9550e416a679457ac73068cd0e0f",
    tone: "text-gold",
    escrow: "orchard.encroe.testnet",
  },
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export function isGame(x: unknown): x is GameId {
  return typeof x === "string" && x in GAMES;
}
