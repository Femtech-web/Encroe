// Matchday's server core, in C++: a football card club economy (coins, packs, rated player cards, matches, a
// transfer market), compiled to WebAssembly with no imports and sealed inside an Encroe package.
//
// The Encroe ABI (all u32/i32), the same as every sealed core:
//   input_ptr(), output_ptr(), load(len) -> count|-1, player_count(), get_key(idx), get_state(idx) -> len|-1,
//   trade(from, to, item, qty) -> 0 ok | 1 insufficient | 2 bad index | 3 club full
// Matchday's moves return the same codes plus 4 (already acted this tick) and 5 (no such pack or card):
//   join() (a 32-byte key in the input buffer), buy_pack(club, pack), open_pack(club, pack, tick),
//   buy_fitness(club), play_match(club, tick) (writes [result, squad, opponent, coins] to the output buffer),
//   quick_sell(club, card), restore_tick(club, tick).

using u8 = unsigned char;
using u32 = unsigned int;
using u64 = unsigned long long;

#define EXPORT(name) extern "C" __attribute__((export_name(#name)))

namespace matchday {

constexpr u32 MAX_CLUBS = 64;
constexpr u32 MAX_ITEMS = 16;
constexpr u32 INPUT_CAP = 16384;

enum Item : u32 { COINS = 1, BRONZE_PACK = 2, SILVER_PACK = 3, GOLD_PACK = 4, FITNESS = 5, TROPHY = 6 };
enum Code : int { OK = 0, INSUFFICIENT = 1, BAD_INDEX = 2, FULL = 3, SAME_TICK = 4, NO_SUCH = 5 };

// Cards are items 100..131: twelve bronze (55-64), twelve silver (65-76), eight gold (78-91).
constexpr u32 FIRST_CARD = 100;
constexpr u32 CARDS = 32;
constexpr u8 RATING[CARDS] = {55, 56, 57, 58, 58, 59, 60, 61, 62, 62, 63, 64, 65, 66, 67, 68, 69, 70,
                              70, 71, 72, 73, 75, 76, 78, 80, 82, 84, 85, 87, 89, 91};

struct Pack {
  u32 price, first, count;
};
// Indexed by pack item - BRONZE_PACK: what it costs and which cards it draws from.
constexpr Pack PACKS[3] = {{400, 0, 12}, {1200, 12, 12}, {3000, 24, 8}};
constexpr u32 CARDS_PER_PACK = 3;
constexpr u32 FITNESS_PRICE = 150;

constexpr bool is_card(u32 item) { return item >= FIRST_CARD && item < FIRST_CARD + CARDS; }
constexpr u32 rating(u32 card) { return RATING[card - FIRST_CARD]; }

struct Club {
  u8 pk[32];
  u32 n;
  u32 ids[MAX_ITEMS];
  u32 qty[MAX_ITEMS];

  u32 has(u32 item) const {
    for (u32 i = 0; i < n; i++)
      if (ids[i] == item) return qty[i];
    return 0;
  }

  /// How many of these items are new to the club (each would take a slot).
  template <u32 N>
  u32 new_kinds(const u32 (&items)[N]) const {
    u32 fresh = 0;
    for (u32 i = 0; i < N; i++) {
      bool seen = has(items[i]) > 0;
      for (u32 j = 0; j < i && !seen; j++) seen = items[j] == items[i];
      fresh += seen ? 0 : 1;
    }
    return fresh;
  }

  /// Removes q of item; the caller has checked there is enough. Ids stay ascending.
  void take(u32 item, u32 q) {
    for (u32 i = 0; i < n; i++) {
      if (ids[i] != item) continue;
      qty[i] -= q;
      if (qty[i] == 0) {
        for (u32 k = i; k + 1 < n; k++) {
          ids[k] = ids[k + 1];
          qty[k] = qty[k + 1];
        }
        n--;
      }
      return;
    }
  }

  /// Adds q of item, keeping ids ascending; false when a new kind would not fit.
  bool give(u32 item, u32 q) {
    for (u32 i = 0; i < n; i++)
      if (ids[i] == item) {
        qty[i] += q;
        return true;
      }
    if (n == MAX_ITEMS) return false;
    u32 at = n;
    while (at > 0 && ids[at - 1] > item) {
      ids[at] = ids[at - 1];
      qty[at] = qty[at - 1];
      at--;
    }
    ids[at] = item;
    qty[at] = q;
    n++;
    return true;
  }

  /// The squad's strength: the average rating of the five best distinct cards (missing places count 40).
  u32 squad() const {
    u32 best[5] = {40, 40, 40, 40, 40};
    for (u32 i = 0; i < n; i++) {
      if (!is_card(ids[i])) continue;
      u32 r = rating(ids[i]);
      for (u32 s = 0; s < 5; s++)
        if (r > best[s]) {
          for (u32 k = 4; k > s; k--) best[k] = best[k - 1];
          best[s] = r;
          break;
        }
    }
    return (best[0] + best[1] + best[2] + best[3] + best[4]) / 5;
  }
};

u8 input[INPUT_CAP];
u8 output[1024];
Club clubs[MAX_CLUBS];
u32 count;
// The last tick each club acted in (opened a pack or played): host bookkeeping, not sealed state.
u32 last_tick[MAX_CLUBS];

u32 rd(const u8* p) { return u32(p[0]) | u32(p[1]) << 8 | u32(p[2]) << 16 | u32(p[3]) << 24; }
void wr(u8* p, u32 v) {
  for (int i = 0; i < 4; i++) p[i] = u8(v >> (8 * i));
}

/// A deterministic draw from a club's key, the tick and a label: the same world replays the same way anywhere.
u32 draw(const Club& c, u32 tick, u32 label) {
  u64 h = 0x9e3779b97f4a7c15ULL ^ (u64(tick) << 32) ^ label;
  for (u32 i = 0; i < 32; i++) {
    h ^= c.pk[i];
    h *= 0x100000001b3ULL;
  }
  h ^= h >> 33;
  h *= 0xff51afd7ed558ccdULL;
  h ^= h >> 33;
  return u32(h);
}

bool valid(u32 idx) { return idx < count; }

}  // namespace matchday

using namespace matchday;

EXPORT(input_ptr) u32 input_ptr() { return u32(reinterpret_cast<unsigned long>(input)); }
EXPORT(output_ptr) u32 output_ptr() { return u32(reinterpret_cast<unsigned long>(output)); }
EXPORT(player_count) u32 player_count() { return count; }

/// Loads a snapshot: count:u32 || (pk[32] || n:u32 || (id:u32, qty:u32)*)*.
EXPORT(load) int load(u32 len) {
  if (len > INPUT_CAP || len < 4) return -1;
  u32 n = rd(input), at = 4;
  if (n > MAX_CLUBS) return -1;
  for (u32 c = 0; c < n; c++) {
    if (at + 36 > len) return -1;
    Club& club = clubs[c];
    for (u32 i = 0; i < 32; i++) club.pk[i] = input[at + i];
    club.n = rd(input + at + 32);
    at += 36;
    if (club.n > MAX_ITEMS || at + 8 * club.n > len) return -1;
    for (u32 i = 0; i < club.n; i++) {
      club.ids[i] = rd(input + at);
      club.qty[i] = rd(input + at + 4);
      at += 8;
    }
  }
  count = n;
  for (u32 c = 0; c < MAX_CLUBS; c++) last_tick[c] = 0;
  return int(n);
}

EXPORT(get_key) int get_key(u32 idx) {
  if (!valid(idx)) return -1;
  for (u32 i = 0; i < 32; i++) output[i] = clubs[idx].pk[i];
  return 32;
}

EXPORT(get_state) int get_state(u32 idx) {
  if (!valid(idx)) return -1;
  const Club& c = clubs[idx];
  wr(output, c.n);
  for (u32 i = 0; i < c.n; i++) {
    wr(output + 4 + 8 * i, c.ids[i]);
    wr(output + 8 + 8 * i, c.qty[i]);
  }
  return int(4 + 8 * c.n);
}

/// The transfer market: anything moves from one club to another, and nothing is created or lost.
EXPORT(trade) int trade(u32 from, u32 to, u32 item, u32 qty) {
  if (!valid(from) || !valid(to) || from == to || qty == 0) return BAD_INDEX;
  if (clubs[from].has(item) < qty) return INSUFFICIENT;
  if (clubs[to].has(item) == 0 && clubs[to].n == MAX_ITEMS) return FULL;
  clubs[from].take(item, qty);
  clubs[to].give(item, qty);
  return OK;
}

/// A new club whose key is in the input buffer gets 1000 coins, a bronze pack and three fitness; a returning key
/// gets its own index back; -1 when the league is full.
EXPORT(join) int join() {
  for (u32 c = 0; c < count; c++) {
    bool same = true;
    for (u32 i = 0; i < 32 && same; i++) same = clubs[c].pk[i] == input[i];
    if (same) return int(c);
  }
  if (count == MAX_CLUBS) return -1;
  Club& club = clubs[count];
  for (u32 i = 0; i < 32; i++) club.pk[i] = input[i];
  club.n = 0;
  club.give(COINS, 1000);
  club.give(BRONZE_PACK, 1);
  club.give(FITNESS, 3);
  last_tick[count] = 0;
  return int(count++);
}

EXPORT(buy_pack) int buy_pack(u32 idx, u32 pack) {
  if (!valid(idx)) return BAD_INDEX;
  if (pack < BRONZE_PACK || pack > GOLD_PACK) return NO_SUCH;
  Club& c = clubs[idx];
  u32 price = PACKS[pack - BRONZE_PACK].price;
  if (c.has(COINS) < price) return INSUFFICIENT;
  if (c.has(pack) == 0 && c.n - (c.has(COINS) == price ? 1 : 0) >= MAX_ITEMS) return FULL;
  c.take(COINS, price);
  c.give(pack, 1);
  return OK;
}

/// Opens a pack: three cards drawn from its tier, all or nothing; one action per tick.
EXPORT(open_pack) int open_pack(u32 idx, u32 pack, u32 tick) {
  if (!valid(idx)) return BAD_INDEX;
  if (pack < BRONZE_PACK || pack > GOLD_PACK) return NO_SUCH;
  if (tick <= last_tick[idx]) return SAME_TICK;
  Club& c = clubs[idx];
  if (c.has(pack) == 0) return INSUFFICIENT;
  const Pack& p = PACKS[pack - BRONZE_PACK];
  u32 cards[CARDS_PER_PACK];
  for (u32 i = 0; i < CARDS_PER_PACK; i++) cards[i] = FIRST_CARD + p.first + draw(c, tick, pack * 16 + i) % p.count;
  u32 freed = c.has(pack) == 1 ? 1 : 0;
  if (c.n - freed + c.new_kinds(cards) > MAX_ITEMS) return FULL;
  c.take(pack, 1);
  for (u32 card : cards) c.give(card, 1);
  last_tick[idx] = tick;
  return OK;
}

EXPORT(buy_fitness) int buy_fitness(u32 idx) {
  if (!valid(idx)) return BAD_INDEX;
  Club& c = clubs[idx];
  if (c.has(COINS) < FITNESS_PRICE) return INSUFFICIENT;
  if (c.has(FITNESS) == 0 && c.n - (c.has(COINS) == FITNESS_PRICE ? 1 : 0) >= MAX_ITEMS) return FULL;
  c.take(COINS, FITNESS_PRICE);
  c.give(FITNESS, 1);
  return OK;
}

/// Plays a match against an opponent the tick draws (rated 58-89): a win pays coins, and beating an 82+ side
/// earns a trophy. Costs one fitness; one action per tick. Writes [result 0 loss / 1 draw / 2 win, squad,
/// opponent, coins won] to the output buffer.
EXPORT(play_match) int play_match(u32 idx, u32 tick) {
  if (!valid(idx)) return BAD_INDEX;
  if (tick <= last_tick[idx]) return SAME_TICK;
  Club& c = clubs[idx];
  if (c.has(FITNESS) == 0) return INSUFFICIENT;
  u32 squad = c.squad();
  u32 opponent = 58 + draw(c, tick, 7) % 32;
  u32 form = draw(c, tick, 11) % 9;  // 0..8: the day's luck
  u32 us = squad + form, them = opponent + 4;
  u32 result = us > them + 1 ? 2 : (us + 1 >= them ? 1 : 0);
  u32 coins = result == 2 ? 300 + (opponent - 58) * 20 : (result == 1 ? 100 : 0);
  bool trophy = result == 2 && opponent >= 82;
  u32 fresh = (coins && c.has(COINS) == 0 ? 1 : 0) + (trophy && c.has(TROPHY) == 0 ? 1 : 0);
  u32 freed = c.has(FITNESS) == 1 ? 1 : 0;
  if (c.n - freed + fresh > MAX_ITEMS) return FULL;
  c.take(FITNESS, 1);
  if (coins) c.give(COINS, coins);
  if (trophy) c.give(TROPHY, 1);
  last_tick[idx] = tick;
  wr(output, result);
  wr(output + 4, squad);
  wr(output + 8, opponent);
  wr(output + 12, coins);
  return OK;
}

/// Sells a card to the league for ten coins per rating point.
EXPORT(quick_sell) int quick_sell(u32 idx, u32 card) {
  if (!valid(idx)) return BAD_INDEX;
  if (!is_card(card)) return NO_SUCH;
  Club& c = clubs[idx];
  if (c.has(card) == 0) return INSUFFICIENT;
  if (c.has(COINS) == 0 && c.n - (c.has(card) == 1 ? 1 : 0) >= MAX_ITEMS) return FULL;
  c.take(card, 1);
  c.give(COINS, rating(card) * 10);
  return OK;
}

EXPORT(restore_tick) int restore_tick(u32 idx, u32 tick) {
  if (!valid(idx)) return BAD_INDEX;
  last_tick[idx] = tick;
  return OK;
}
