/*
 * Neon City's server core, in C: an open-world city economy (cash, fuel, parts, respect; vehicles that unlock
 * jobs from deliveries to heists; properties that pay out), compiled to WebAssembly with no imports and sealed
 * inside an Encroe package.
 *
 * The Encroe ABI (all u32/i32), the same as every sealed core:
 *   input_ptr(), output_ptr(), load(len) -> count|-1, player_count(), get_key(idx), get_state(idx) -> len|-1,
 *   trade(from, to, item, qty) -> 0 ok | 1 insufficient | 2 bad index | 3 garage full
 * Neon City's moves return the same codes plus 4 (already acted this tick) and 5 (no such job or item):
 *   join() (a 32-byte key in the input buffer), job(player, kind, tick) (writes [success, cash, respect] to the
 *   output buffer), collect(player, tick), buy(player, item), sell(player, item), restore_tick(player, tick).
 */

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long long u64;

#define EXPORT(name) __attribute__((export_name(#name)))
#define MAX_PLAYERS 64
#define MAX_ITEMS 16
#define INPUT_CAP 16384

enum { CASH = 1, FUEL = 2, PARTS = 3, RESPECT = 4 };
enum { SCOOTER = 20, TAXI = 21, MUSCLE_CAR = 22, ARMORED_VAN = 23, HELICOPTER = 24 };
enum { GARAGE = 30, NIGHTCLUB = 31, PENTHOUSE = 32, HANGAR = 33 };
enum { OK = 0, INSUFFICIENT = 1, BAD_INDEX = 2, FULL = 3, SAME_TICK = 4, NO_SUCH = 5 };

/* What the city sells, in cash ($100 units); the city buys vehicles and property back at half. */
static const struct { u32 item, price; } MARKET[] = {
    {FUEL, 1},         {PARTS, 4},        {SCOOTER, 20},  {TAXI, 120},      {MUSCLE_CAR, 300},
    {ARMORED_VAN, 800}, {HELICOPTER, 2500}, {GARAGE, 200}, {NIGHTCLUB, 1500}, {PENTHOUSE, 5000},
    {HANGAR, 3000},
};
#define MARKET_LEN (sizeof MARKET / sizeof MARKET[0])

/* The five jobs: the vehicle (and property) they need, what they burn, what they pay, and how often they work. */
static const struct {
  u32 vehicle, property, fuel, parts, min_respect, cash, respect, odds;
} JOBS[] = {
    {SCOOTER, 0, 1, 0, 0, 8, 1, 100},        /* 1 delivery */
    {TAXI, 0, 1, 0, 0, 15, 1, 100},          /* 2 taxi fare */
    {MUSCLE_CAR, 0, 2, 0, 0, 40, 3, 60},     /* 3 street race */
    {ARMORED_VAN, 0, 2, 3, 10, 150, 5, 70},  /* 4 heist */
    {HELICOPTER, HANGAR, 4, 0, 20, 300, 4, 90}, /* 5 air cargo */
};
#define JOBS_LEN (sizeof JOBS / sizeof JOBS[0])

typedef struct {
  u8 pk[32];
  u32 n;
  u32 ids[MAX_ITEMS];
  u32 qty[MAX_ITEMS];
} Player;

static u8 input[INPUT_CAP];
static u8 output[1024];
static Player players[MAX_PLAYERS];
static u32 count;
/* The last tick each player worked or collected in: host bookkeeping, not sealed state. */
static u32 last_tick[MAX_PLAYERS];

static u32 rd(const u8 *p) { return (u32)p[0] | (u32)p[1] << 8 | (u32)p[2] << 16 | (u32)p[3] << 24; }

static void wr(u8 *p, u32 v) {
  for (int i = 0; i < 4; i++) p[i] = (u8)(v >> (8 * i));
}

static u32 has(const Player *p, u32 item) {
  for (u32 i = 0; i < p->n; i++)
    if (p->ids[i] == item) return p->qty[i];
  return 0;
}

/* Removes q of item; the caller has checked there is enough. Ids stay ascending. */
static void take(Player *p, u32 item, u32 q) {
  for (u32 i = 0; i < p->n; i++) {
    if (p->ids[i] != item) continue;
    p->qty[i] -= q;
    if (p->qty[i] == 0) {
      for (u32 k = i; k + 1 < p->n; k++) {
        p->ids[k] = p->ids[k + 1];
        p->qty[k] = p->qty[k + 1];
      }
      p->n--;
    }
    return;
  }
}

/* Adds q of item, keeping ids ascending; 0 when a new kind would not fit. */
static int give(Player *p, u32 item, u32 q) {
  for (u32 i = 0; i < p->n; i++)
    if (p->ids[i] == item) {
      p->qty[i] += q;
      return 1;
    }
  if (p->n == MAX_ITEMS) return 0;
  u32 at = p->n;
  while (at > 0 && p->ids[at - 1] > item) {
    p->ids[at] = p->ids[at - 1];
    p->qty[at] = p->qty[at - 1];
    at--;
  }
  p->ids[at] = item;
  p->qty[at] = q;
  p->n++;
  return 1;
}

/* Slots left after taking `spent` of `item` (a kind spent to zero frees its slot). */
static u32 room_after(const Player *p, u32 item, u32 spent) {
  u32 n = p->n - (spent && has(p, item) == spent ? 1 : 0);
  return MAX_ITEMS - n;
}

/* A deterministic draw from the player's key, the tick and a label. */
static u32 draw(const Player *p, u32 tick, u32 label) {
  u64 h = 0xcbf29ce484222325ULL ^ ((u64)tick << 32) ^ label;
  for (u32 i = 0; i < 32; i++) {
    h ^= p->pk[i];
    h *= 0x100000001b3ULL;
  }
  h ^= h >> 31;
  h *= 0x94d049bb133111ebULL;
  h ^= h >> 29;
  return (u32)h;
}

static int valid(u32 idx) { return idx < count; }

static u32 price_of(u32 item) {
  for (u32 i = 0; i < MARKET_LEN; i++)
    if (MARKET[i].item == item) return MARKET[i].price;
  return 0;
}

EXPORT(input_ptr) u32 input_ptr(void) { return (u32)(unsigned long)input; }
EXPORT(output_ptr) u32 output_ptr(void) { return (u32)(unsigned long)output; }
EXPORT(player_count) u32 player_count(void) { return count; }

/* Loads a snapshot: count:u32 || (pk[32] || n:u32 || (id:u32, qty:u32)*)*. */
EXPORT(load) int load(u32 len) {
  if (len > INPUT_CAP || len < 4) return -1;
  u32 n = rd(input), at = 4;
  if (n > MAX_PLAYERS) return -1;
  for (u32 c = 0; c < n; c++) {
    if (at + 36 > len) return -1;
    Player *p = &players[c];
    for (u32 i = 0; i < 32; i++) p->pk[i] = input[at + i];
    p->n = rd(input + at + 32);
    at += 36;
    if (p->n > MAX_ITEMS || at + 8 * p->n > len) return -1;
    for (u32 i = 0; i < p->n; i++) {
      p->ids[i] = rd(input + at);
      p->qty[i] = rd(input + at + 4);
      at += 8;
    }
  }
  count = n;
  for (u32 c = 0; c < MAX_PLAYERS; c++) last_tick[c] = 0;
  return (int)n;
}

EXPORT(get_key) int get_key(u32 idx) {
  if (!valid(idx)) return -1;
  for (u32 i = 0; i < 32; i++) output[i] = players[idx].pk[i];
  return 32;
}

EXPORT(get_state) int get_state(u32 idx) {
  if (!valid(idx)) return -1;
  const Player *p = &players[idx];
  wr(output, p->n);
  for (u32 i = 0; i < p->n; i++) {
    wr(output + 4 + 8 * i, p->ids[i]);
    wr(output + 8 + 8 * i, p->qty[i]);
  }
  return (int)(4 + 8 * p->n);
}

/* Player to player: cash, cars, deeds; nothing is created or lost. */
EXPORT(trade) int trade(u32 from, u32 to, u32 item, u32 qty) {
  if (!valid(from) || !valid(to) || from == to || qty == 0) return BAD_INDEX;
  if (has(&players[from], item) < qty) return INSUFFICIENT;
  if (has(&players[to], item) == 0 && players[to].n == MAX_ITEMS) return FULL;
  take(&players[from], item, qty);
  give(&players[to], item, qty);
  return OK;
}

/* A new player (key in the input buffer) arrives with $5,000, five fuel and a scooter; a returning key gets its
 * own index back; -1 when the city is full. */
EXPORT(join) int join(void) {
  for (u32 c = 0; c < count; c++) {
    int same = 1;
    for (u32 i = 0; i < 32 && same; i++) same = players[c].pk[i] == input[i];
    if (same) return (int)c;
  }
  if (count == MAX_PLAYERS) return -1;
  Player *p = &players[count];
  for (u32 i = 0; i < 32; i++) p->pk[i] = input[i];
  p->n = 0;
  give(p, CASH, 50);
  give(p, FUEL, 5);
  give(p, SCOOTER, 1);
  last_tick[count] = 0;
  return (int)count++;
}

/* Runs job `kind` (1-5): it burns its fuel and parts whether it works or not, and pays only if it works. One
 * action per tick. Writes [success, cash, respect] to the output buffer. */
EXPORT(job) int job(u32 idx, u32 kind, u32 tick) {
  if (!valid(idx)) return BAD_INDEX;
  if (kind < 1 || kind > JOBS_LEN) return NO_SUCH;
  if (tick <= last_tick[idx]) return SAME_TICK;
  Player *p = &players[idx];
  __typeof__(JOBS[0]) j = JOBS[kind - 1];
  if (!has(p, j.vehicle) || (j.property && !has(p, j.property))) return INSUFFICIENT;
  if (has(p, FUEL) < j.fuel || has(p, PARTS) < j.parts || has(p, RESPECT) < j.min_respect) return INSUFFICIENT;
  u32 success = draw(p, tick, kind) % 100 < j.odds;
  u32 freed = (has(p, FUEL) == j.fuel ? 1 : 0) + (j.parts && has(p, PARTS) == j.parts ? 1 : 0);
  u32 fresh = success ? (has(p, CASH) ? 0 : 1) + (has(p, RESPECT) ? 0 : 1) : 0;
  if (p->n - freed + fresh > MAX_ITEMS) return FULL;
  take(p, FUEL, j.fuel);
  if (j.parts) take(p, PARTS, j.parts);
  if (success) {
    give(p, CASH, j.cash);
    give(p, RESPECT, j.respect);
  }
  last_tick[idx] = tick;
  wr(output, success);
  wr(output + 4, success ? j.cash : 0);
  wr(output + 8, success ? j.respect : 0);
  return OK;
}

/* Property pays out: each nightclub 25 cash, each garage one part. One action per tick. */
EXPORT(collect) int collect(u32 idx, u32 tick) {
  if (!valid(idx)) return BAD_INDEX;
  if (tick <= last_tick[idx]) return SAME_TICK;
  Player *p = &players[idx];
  u32 cash = 25 * has(p, NIGHTCLUB), parts = has(p, GARAGE);
  if (!cash && !parts) return INSUFFICIENT;
  u32 fresh = (cash && !has(p, CASH) ? 1 : 0) + (parts && !has(p, PARTS) ? 1 : 0);
  if (p->n + fresh > MAX_ITEMS) return FULL;
  if (cash) give(p, CASH, cash);
  if (parts) give(p, PARTS, parts);
  last_tick[idx] = tick;
  return OK;
}

EXPORT(buy) int buy(u32 idx, u32 item) {
  if (!valid(idx)) return BAD_INDEX;
  u32 price = price_of(item);
  if (!price) return NO_SUCH;
  Player *p = &players[idx];
  if (has(p, CASH) < price) return INSUFFICIENT;
  if (!has(p, item) && room_after(p, CASH, price) == 0) return FULL;
  take(p, CASH, price);
  give(p, item, 1);
  return OK;
}

/* The city buys vehicles and property back at half price; fuel and parts are not bought back. */
EXPORT(sell) int sell(u32 idx, u32 item) {
  if (!valid(idx)) return BAD_INDEX;
  if (item < SCOOTER || !price_of(item)) return NO_SUCH;
  Player *p = &players[idx];
  if (!has(p, item)) return INSUFFICIENT;
  if (!has(p, CASH) && room_after(p, item, 1) == 0) return FULL;
  take(p, item, 1);
  give(p, CASH, price_of(item) / 2);
  return OK;
}

EXPORT(restore_tick) int restore_tick(u32 idx, u32 tick) {
  if (!valid(idx)) return BAD_INDEX;
  last_tick[idx] = tick;
  return OK;
}
