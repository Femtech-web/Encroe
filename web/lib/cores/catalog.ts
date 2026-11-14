import { ITEMS } from "../game/items";

/**
 * What a revived world is, known by its core's hash: the game, the language its server core is written in, and
 * names for its items. A core not listed here still revives; its items show as numbers.
 */
export type Catalog = {
  game: string;
  language: string;
  genre: string;
  items: Record<number, string>;
  /** The game's own moves, for the generic play screen (Embergate has its own). */
  moves?: CoreMove[];
};

/** One export a player can call: its arguments after the player's index, and how to read what it wrote. */
export type CoreMove = {
  name: string;
  label: string;
  args: ({ kind: "tick" } | { kind: "choice"; options: [number, string][] } | { kind: "owned"; from: number })[];
  /** Reads the output buffer after a successful move. */
  says?: { words: number; read: (out: number[]) => string };
};

const MATCH_RESULT = ["lost", "drew", "won"];

const MATCHDAY_CARDS = [
  "J. Okafor · GK",
  "L. Brandt · DEF",
  "S. Moreau · DEF",
  "K. Adeyemi · MID",
  "T. Lindqvist · DEF",
  "R. Castillo · MID",
  "D. Nwosu · FWD",
  "M. Petrov · MID",
  "A. Haddad · DEF",
  "Y. Tanaka · MID",
  "E. Kowalski · FWD",
  "B. Silva · GK",
  "C. Mensah · DEF",
  "N. Rossi · MID",
  "F. Dubois · FWD",
  "O. Bakr · DEF",
  "I. Novak · MID",
  "H. Jansen · GK",
  "P. Oduya · FWD",
  "V. Ortega · MID",
  "G. Achterberg · DEF",
  "U. Chukwu · FWD",
  "W. Ferreira · MID",
  "Z. Kim · FWD",
  "Q. Laurent · GK",
  "X. Mbeki · DEF",
  "A. Valdés · MID",
  "S. Okonkwo · FWD",
  "L. Romano · MID",
  "T. Adebayo · FWD",
  "E. Nakamura · MID",
  "R. Aguilar · FWD",
];

export const CATALOGS: Record<string, Catalog> = {
  "49ff0c57f10f24b9091eae3bd218b28a642d581f698871f6b3c65b7effa9cb62": {
    game: "Embergate",
    language: "Rust",
    genre: "crafting world",
    items: Object.fromEntries(Object.values(ITEMS).map((i) => [i.id, i.name])),
  },
  f149751774f754b956636225c79d294494e1b5dc2c523867eeb2d5b3f96dba4a: {
    game: "Matchday",
    language: "C++",
    genre: "football card club",
    items: {
      1: "Coins",
      2: "Bronze pack",
      3: "Silver pack",
      4: "Gold pack",
      5: "Fitness",
      6: "Trophy",
      ...Object.fromEntries(MATCHDAY_CARDS.map((name, i) => [100 + i, name])),
    },
    moves: [
      {
        name: "play_match",
        label: "Play a match",
        args: [{ kind: "tick" }],
        says: {
          words: 4,
          read: ([r, squad, opp, coins]) => `You ${MATCH_RESULT[r]} (squad ${squad} v ${opp}), +${coins} coins`,
        },
      },
      {
        name: "open_pack",
        label: "Open a pack",
        args: [
          {
            kind: "choice",
            options: [
              [2, "Bronze"],
              [3, "Silver"],
              [4, "Gold"],
            ],
          },
          { kind: "tick" },
        ],
      },
      {
        name: "buy_pack",
        label: "Buy a pack",
        args: [
          {
            kind: "choice",
            options: [
              [2, "Bronze · 400"],
              [3, "Silver · 1200"],
              [4, "Gold · 3000"],
            ],
          },
        ],
      },
      { name: "buy_fitness", label: "Buy fitness · 150", args: [] },
      { name: "quick_sell", label: "Quick-sell a card", args: [{ kind: "owned", from: 100 }] },
    ],
  },
  "3f4a1e626aa6fc2e819aaaf5e3ee718e0e6307de87d47c895a93addb336bb3d2": {
    game: "Neon City",
    language: "C",
    genre: "open-world city economy",
    items: {
      1: "Cash ($100s)",
      2: "Fuel",
      3: "Parts",
      4: "Respect",
      20: "Scooter",
      21: "Taxi",
      22: "Muscle car",
      23: "Armored van",
      24: "Helicopter",
      30: "Garage",
      31: "Nightclub",
      32: "Penthouse",
      33: "Hangar",
    },
    moves: [
      {
        name: "job",
        label: "Work a job",
        args: [
          {
            kind: "choice",
            options: [
              [1, "Delivery · scooter"],
              [2, "Taxi fare · taxi"],
              [3, "Street race · muscle car"],
              [4, "Heist · armored van, 10 respect"],
              [5, "Air cargo · helicopter + hangar"],
            ],
          },
          { kind: "tick" },
        ],
        says: {
          words: 3,
          read: ([ok, cash, respect]) =>
            ok ? `It worked: +${cash} cash, +${respect} respect` : "It went wrong: fuel spent, nothing paid",
        },
      },
      { name: "collect", label: "Collect from property", args: [{ kind: "tick" }] },
      {
        name: "buy",
        label: "Buy",
        args: [
          {
            kind: "choice",
            options: [
              [2, "Fuel · 1"],
              [3, "Parts · 4"],
              [21, "Taxi · 120"],
              [22, "Muscle car · 300"],
              [23, "Armored van · 800"],
              [24, "Helicopter · 2500"],
              [30, "Garage · 200"],
              [31, "Nightclub · 1500"],
              [32, "Penthouse · 5000"],
              [33, "Hangar · 3000"],
            ],
          },
        ],
      },
      { name: "sell", label: "Sell back at half", args: [{ kind: "owned", from: 20 }] },
    ],
  },
};
