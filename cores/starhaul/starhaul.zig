//! Starhaul's server core, in Zig: a space freight economy (mine asteroid belts, refine ore into alloy, fly
//! delivery contracts for credits and standing; buy ships that reach richer belts), compiled to WebAssembly with no
//! imports and sealed inside an Encroe package.
//!
//! The Encroe ABI (all u32/i32), the same as every sealed core:
//!   input_ptr(), output_ptr(), load(len) -> count|-1, player_count(), get_key(idx), get_state(idx) -> len|-1,
//!   trade(from, to, item, qty) -> 0 ok | 1 insufficient | 2 bad index | 3 hold full
//! Starhaul's moves return the same codes plus 4 (already acted this tick) and 5 (no such belt, contract or item):
//!   join() (a 32-byte key in the input buffer), mine(player, belt, tick) (writes [item, qty]), refine(player),
//!   deliver(player, contract, tick) (writes [credits, standing, rush]), buy(player, item), sell(player, item),
//!   restore_tick(player, tick).

const MAX_PLAYERS = 64;
const MAX_ITEMS = 16;
const INPUT_CAP = 16384;

const CREDITS: u32 = 1;
const FUEL: u32 = 2;
const ORE: u32 = 3;
const ICE: u32 = 4;
const ALLOY: u32 = 5;
const STANDING: u32 = 6;
const SKIFF: u32 = 20;
const HAULER: u32 = 21;
const ICE_CUTTER: u32 = 22;
const DEEP_MINER: u32 = 23;
const REFINERY: u32 = 30;

const OK: i32 = 0;
const INSUFFICIENT: i32 = 1;
const BAD_INDEX: i32 = 2;
const FULL: i32 = 3;
const SAME_TICK: i32 = 4;
const NO_SUCH: i32 = 5;

/// What the station sells, in credits; it buys ships and the refinery back at half.
const Price = struct { item: u32, price: u32 };
const MARKET = [_]Price{
    .{ .item = FUEL, .price = 4 },          .{ .item = SKIFF, .price = 60 },
    .{ .item = HAULER, .price = 500 },      .{ .item = ICE_CUTTER, .price = 350 },
    .{ .item = DEEP_MINER, .price = 2000 }, .{ .item = REFINERY, .price = 700 },
};

/// The four belts: the ship that reaches them, the fuel it burns, what they yield and how much.
const Belt = struct { ship: u32, fuel: u32, item: u32, base: u32, spread: u32 };
const BELTS = [_]Belt{
    .{ .ship = SKIFF, .fuel = 1, .item = ORE, .base = 2, .spread = 3 }, // 1 inner belt
    .{ .ship = ICE_CUTTER, .fuel = 1, .item = ICE, .base = 2, .spread = 4 }, // 2 ice ring
    .{ .ship = HAULER, .fuel = 2, .item = ORE, .base = 5, .spread = 5 }, // 3 outer belt
    .{ .ship = DEEP_MINER, .fuel = 3, .item = ALLOY, .base = 1, .spread = 2 }, // 4 deep field: native alloy
};

/// The three contracts: the cargo they take, what they pay, and the standing they need.
const Contract = struct { cargo: u32, qty: u32, credits: u32, standing: u32, min_standing: u32 };
const CONTRACTS = [_]Contract{
    .{ .cargo = ORE, .qty = 6, .credits = 40, .standing = 1, .min_standing = 0 }, // 1 ore to the shipyards
    .{ .cargo = ICE, .qty = 4, .credits = 45, .standing = 1, .min_standing = 0 }, // 2 water to the colony
    .{ .cargo = ALLOY, .qty = 2, .credits = 180, .standing = 3, .min_standing = 5 }, // 3 alloy to the station
};

const Player = struct {
    pk: [32]u8,
    n: u32,
    ids: [MAX_ITEMS]u32,
    qty: [MAX_ITEMS]u32,
};

var input: [INPUT_CAP]u8 = undefined;
var output: [1024]u8 = undefined;
var players: [MAX_PLAYERS]Player = undefined;
var count: u32 = 0;
/// The last tick each player mined or delivered in: host bookkeeping, not sealed state.
var last_tick: [MAX_PLAYERS]u32 = @splat(0);

fn rd(at: u32) u32 {
    return @as(u32, input[at]) | @as(u32, input[at + 1]) << 8 | @as(u32, input[at + 2]) << 16 | @as(u32, input[at + 3]) << 24;
}

fn wr(at: u32, v: u32) void {
    var i: u32 = 0;
    while (i < 4) : (i += 1) output[at + i] = @truncate(v >> @intCast(8 * i));
}

fn has(p: *const Player, item: u32) u32 {
    var i: u32 = 0;
    while (i < p.n) : (i += 1) if (p.ids[i] == item) return p.qty[i];
    return 0;
}

/// Removes q of item; the caller has checked there is enough. Ids stay ascending.
fn take(p: *Player, item: u32, q: u32) void {
    var i: u32 = 0;
    while (i < p.n) : (i += 1) {
        if (p.ids[i] != item) continue;
        p.qty[i] -= q;
        if (p.qty[i] == 0) {
            var k = i;
            while (k + 1 < p.n) : (k += 1) {
                p.ids[k] = p.ids[k + 1];
                p.qty[k] = p.qty[k + 1];
            }
            p.n -= 1;
        }
        return;
    }
}

/// Adds q of item, keeping ids ascending; false when a new kind would not fit.
fn give(p: *Player, item: u32, q: u32) bool {
    var i: u32 = 0;
    while (i < p.n) : (i += 1) if (p.ids[i] == item) {
        p.qty[i] +%= q;
        return true;
    };
    if (p.n == MAX_ITEMS) return false;
    var at = p.n;
    while (at > 0 and p.ids[at - 1] > item) : (at -= 1) {
        p.ids[at] = p.ids[at - 1];
        p.qty[at] = p.qty[at - 1];
    }
    p.ids[at] = item;
    p.qty[at] = q;
    p.n += 1;
    return true;
}

/// Kinds held after spending `spent` of `item` (a kind spent to zero frees its slot).
fn kinds_after(p: *const Player, item: u32, spent: u32) u32 {
    return p.n - @as(u32, if (spent > 0 and has(p, item) == spent) 1 else 0);
}

/// A deterministic draw from the player's key, the tick and a label.
fn draw(p: *const Player, tick: u32, label: u32) u32 {
    var h: u64 = 0xcbf29ce484222325 ^ (@as(u64, tick) << 32) ^ label;
    for (p.pk) |b| {
        h ^= b;
        h *%= 0x100000001b3;
    }
    h ^= h >> 31;
    h *%= 0x94d049bb133111eb;
    h ^= h >> 29;
    return @truncate(h);
}

fn price_of(item: u32) u32 {
    for (MARKET) |m| if (m.item == item) return m.price;
    return 0;
}

export fn input_ptr() u32 {
    return @intCast(@intFromPtr(&input));
}

export fn output_ptr() u32 {
    return @intCast(@intFromPtr(&output));
}

export fn player_count() u32 {
    return count;
}

/// Loads a snapshot: count:u32 || (pk[32] || n:u32 || (id:u32, qty:u32)*)*.
export fn load(len: u32) i32 {
    if (len > INPUT_CAP or len < 4) return -1;
    const n = rd(0);
    if (n > MAX_PLAYERS) return -1;
    var at: u32 = 4;
    var c: u32 = 0;
    while (c < n) : (c += 1) {
        if (at + 36 > len) return -1;
        const p = &players[c];
        var i: u32 = 0;
        while (i < 32) : (i += 1) p.pk[i] = input[at + i];
        p.n = rd(at + 32);
        at += 36;
        if (p.n > MAX_ITEMS or at + 8 * p.n > len) return -1;
        i = 0;
        while (i < p.n) : (i += 1) {
            p.ids[i] = rd(at);
            p.qty[i] = rd(at + 4);
            at += 8;
        }
    }
    count = n;
    for (&last_tick) |*t| t.* = 0;
    return @intCast(n);
}

export fn get_key(idx: u32) i32 {
    if (idx >= count) return -1;
    var i: u32 = 0;
    while (i < 32) : (i += 1) output[i] = players[idx].pk[i];
    return 32;
}

export fn get_state(idx: u32) i32 {
    if (idx >= count) return -1;
    const p = &players[idx];
    wr(0, p.n);
    var i: u32 = 0;
    while (i < p.n) : (i += 1) {
        wr(4 + 8 * i, p.ids[i]);
        wr(8 + 8 * i, p.qty[i]);
    }
    return @intCast(4 + 8 * p.n);
}

/// Pilot to pilot: credits, cargo, ships; nothing is created or lost.
export fn trade(from: u32, to: u32, item: u32, qty: u32) i32 {
    if (from >= count or to >= count or from == to or qty == 0) return BAD_INDEX;
    if (has(&players[from], item) < qty) return INSUFFICIENT;
    const held = has(&players[to], item);
    if (held == 0 and players[to].n == MAX_ITEMS) return FULL;
    if (held > 0xffffffff - qty) return FULL;
    take(&players[from], item, qty);
    _ = give(&players[to], item, qty);
    return OK;
}

/// A new pilot (key in the input buffer) starts with 400 credits, six fuel and a skiff; a returning key gets its own
/// index back; -1 when the sector is full.
export fn join() i32 {
    var c: u32 = 0;
    while (c < count) : (c += 1) {
        var same = true;
        var i: u32 = 0;
        while (i < 32 and same) : (i += 1) same = players[c].pk[i] == input[i];
        if (same) return @intCast(c);
    }
    if (count == MAX_PLAYERS) return -1;
    const p = &players[count];
    var i: u32 = 0;
    while (i < 32) : (i += 1) p.pk[i] = input[i];
    p.n = 0;
    _ = give(p, CREDITS, 400);
    _ = give(p, FUEL, 6);
    _ = give(p, SKIFF, 1);
    last_tick[count] = 0;
    count += 1;
    return @intCast(count - 1);
}

/// Mines belt 1-4 with the ship that reaches it, burning its fuel. One action per tick. Writes [item, qty].
export fn mine(idx: u32, belt: u32, tick: u32) i32 {
    if (idx >= count) return BAD_INDEX;
    if (belt < 1 or belt > BELTS.len) return NO_SUCH;
    if (tick <= last_tick[idx]) return SAME_TICK;
    const p = &players[idx];
    const b = BELTS[belt - 1];
    if (has(p, b.ship) == 0 or has(p, FUEL) < b.fuel) return INSUFFICIENT;
    const yield_qty = b.base + draw(p, tick, belt) % b.spread;
    if (kinds_after(p, FUEL, b.fuel) + @as(u32, if (has(p, b.item) == 0) 1 else 0) > MAX_ITEMS) return FULL;
    take(p, FUEL, b.fuel);
    _ = give(p, b.item, yield_qty);
    last_tick[idx] = tick;
    wr(0, b.item);
    wr(4, yield_qty);
    return OK;
}

/// The refinery turns three ore and one ice into one alloy.
export fn refine(idx: u32) i32 {
    if (idx >= count) return BAD_INDEX;
    const p = &players[idx];
    if (has(p, REFINERY) == 0 or has(p, ORE) < 3 or has(p, ICE) < 1) return INSUFFICIENT;
    const freed = @as(u32, if (has(p, ORE) == 3) 1 else 0) + @as(u32, if (has(p, ICE) == 1) 1 else 0);
    if (p.n - freed + @as(u32, if (has(p, ALLOY) == 0) 1 else 0) > MAX_ITEMS) return FULL;
    take(p, ORE, 3);
    take(p, ICE, 1);
    _ = give(p, ALLOY, 1);
    return OK;
}

/// Flies contract 1-3: hands over its cargo for credits and standing; one run in five is a rush order at half as much
/// again. One action per tick. Writes [credits, standing, rush].
export fn deliver(idx: u32, contract: u32, tick: u32) i32 {
    if (idx >= count) return BAD_INDEX;
    if (contract < 1 or contract > CONTRACTS.len) return NO_SUCH;
    if (tick <= last_tick[idx]) return SAME_TICK;
    const p = &players[idx];
    const c = CONTRACTS[contract - 1];
    if (has(p, c.cargo) < c.qty or has(p, STANDING) < c.min_standing) return INSUFFICIENT;
    const rush = draw(p, tick, 100 + contract) % 5 == 0;
    const credits = if (rush) c.credits + c.credits / 2 else c.credits;
    const fresh = @as(u32, if (has(p, CREDITS) == 0) 1 else 0) + @as(u32, if (has(p, STANDING) == 0) 1 else 0);
    if (kinds_after(p, c.cargo, c.qty) + fresh > MAX_ITEMS) return FULL;
    take(p, c.cargo, c.qty);
    _ = give(p, CREDITS, credits);
    _ = give(p, STANDING, c.standing);
    last_tick[idx] = tick;
    wr(0, credits);
    wr(4, c.standing);
    wr(8, @intFromBool(rush));
    return OK;
}

export fn buy(idx: u32, item: u32) i32 {
    if (idx >= count) return BAD_INDEX;
    const price = price_of(item);
    if (price == 0) return NO_SUCH;
    const p = &players[idx];
    if (has(p, CREDITS) < price) return INSUFFICIENT;
    if (has(p, item) == 0 and kinds_after(p, CREDITS, price) == MAX_ITEMS) return FULL;
    take(p, CREDITS, price);
    _ = give(p, item, 1);
    return OK;
}

/// The station buys ships and the refinery back at half; fuel is not bought back.
export fn sell(idx: u32, item: u32) i32 {
    if (idx >= count) return BAD_INDEX;
    if (item < SKIFF or price_of(item) == 0) return NO_SUCH;
    const p = &players[idx];
    if (has(p, item) == 0) return INSUFFICIENT;
    if (has(p, CREDITS) == 0 and kinds_after(p, item, 1) == MAX_ITEMS) return FULL;
    take(p, item, 1);
    _ = give(p, CREDITS, price_of(item) / 2);
    return OK;
}

export fn restore_tick(idx: u32, tick: u32) i32 {
    if (idx >= count) return BAD_INDEX;
    last_tick[idx] = tick;
    return OK;
}
