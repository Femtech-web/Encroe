import { ITEMS } from "../game/items";

/**
 * What a revived world is, known by its core's hash: the game, the language its server core is written in, and
 * names for its items. A core not listed here still revives; its items show as numbers.
 */
export type Catalog = { game: string; language: string; genre: string; items: Record<number, string> };

const MATCHDAY_CARDS = [
  "J. Okafor · GK", "L. Brandt · DEF", "S. Moreau · DEF", "K. Adeyemi · MID", "T. Lindqvist · DEF", "R. Castillo · MID",
  "D. Nwosu · FWD", "M. Petrov · MID", "A. Haddad · DEF", "Y. Tanaka · MID", "E. Kowalski · FWD", "B. Silva · GK",
  "C. Mensah · DEF", "N. Rossi · MID", "F. Dubois · FWD", "O. Bakr · DEF", "I. Novak · MID", "H. Jansen · GK",
  "P. Oduya · FWD", "V. Ortega · MID", "G. Achterberg · DEF", "U. Chukwu · FWD", "W. Ferreira · MID", "Z. Kim · FWD",
  "Q. Laurent · GK", "X. Mbeki · DEF", "A. Valdés · MID", "S. Okonkwo · FWD", "L. Romano · MID", "T. Adebayo · FWD",
  "E. Nakamura · MID", "R. Aguilar · FWD",
];

export const CATALOGS: Record<string, Catalog> = {
  "49ff0c57f10f24b9091eae3bd218b28a642d581f698871f6b3c65b7effa9cb62": {
    game: "Embergate",
    language: "Rust",
    genre: "crafting world",
    items: Object.fromEntries(Object.values(ITEMS).map((i) => [i.id, i.name])),
  },
  "7c5c8e3f05cc624bc154d7b6f17f4364c05068398038ee14ec0f201ed69458fe": {
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
  },
  "165e920322f1307799696a4b682763a01d500b08763a0e997357da1e9d51f891": {
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
  },
};
