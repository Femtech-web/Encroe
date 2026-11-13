//! Embergate's server core: every rule of the game's economy, sealed inside an Encroe package.
//!
//! The ABI the Encroe verifier checks in the enclave is the go/no-go core's, unchanged (all u32/i32):
//! `input_ptr()`, `output_ptr()`, `load(len) -> count|-1`, `player_count()`,
//! `get_state(idx) -> len|-1` (canonical state bytes into the output buffer),
//! `trade(from, to, item, qty) -> 0 ok | 1 insufficient | 2 bad index | 3 inventory full`.
//! The game adds its moves: `join()` (a 32-byte key in the input buffer), `gather(player, node, tick)` and
//! `craft(player, recipe)`, which return the same codes plus `4` (already gathered this tick) and `5` (no such
//! node or recipe). `restore_tick(player, tick)` lets a stateless host carry the gather cooldown across requests.
#![cfg_attr(target_arch = "wasm32", no_std)]

use core::ptr::addr_of_mut;

const MAX_PLAYERS: usize = 64;
const MAX_ITEMS: usize = 16;

/// Materials 1–6 come from the six nodes; relics 9–14 are forged.
pub const EMBER: u32 = 1;
pub const ORE: u32 = 2;
pub const CRYSTAL: u32 = 3;
pub const TIMBER: u32 = 4;
pub const MOONSILK: u32 = 5;
pub const ASH: u32 = 6;
pub const LANTERN: u32 = 9;
pub const BLADE: u32 = 10;
pub const PRISM: u32 = 11;
pub const BOW: u32 = 12;
pub const CROWN: u32 = 13;
pub const PHOENIX: u32 = 14;

/// Recipe `r` (1–6) forges `RECIPES[r - 1].0` from its ingredients.
const RECIPES: [(u32, &[(u32, u32)]); 6] = [
    (LANTERN, &[(EMBER, 2), (ORE, 1)]),
    (BLADE, &[(EMBER, 1), (ORE, 3)]),
    (PRISM, &[(CRYSTAL, 3), (MOONSILK, 1)]),
    (BOW, &[(TIMBER, 3), (MOONSILK, 1)]),
    (CROWN, &[(ASH, 2), (LANTERN, 1), (PRISM, 1)]),
    (PHOENIX, &[(EMBER, 5), (BLADE, 1), (BOW, 1), (CROWN, 1)]),
];
/// What a new player starts with.
const STARTER: [(u32, u32); 2] = [(EMBER, 3), (ORE, 2)];

#[derive(Clone, Copy)]
struct Player {
    pk: [u8; 32],
    n: usize,
    ids: [u32; MAX_ITEMS],
    qty: [u32; MAX_ITEMS],
}

const EMPTY: Player = Player { pk: [0; 32], n: 0, ids: [0; MAX_ITEMS], qty: [0; MAX_ITEMS] };

static mut INPUT: [u8; 16384] = [0; 16384];
static mut OUTPUT: [u8; 1024] = [0; 1024];
static mut PLAYERS: [Player; MAX_PLAYERS] = [EMPTY; MAX_PLAYERS];
static mut COUNT: usize = 0;
/// The last tick each player gathered in; not part of the sealed state (a restored server starts fresh).
static mut LAST_GATHER: [u32; MAX_PLAYERS] = [0; MAX_PLAYERS];

fn rd(buf: &[u8], at: &mut usize) -> Option<u32> {
    let b = buf.get(*at..*at + 4)?;
    *at += 4;
    Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn players() -> &'static mut [Player; MAX_PLAYERS] {
    unsafe { &mut *addr_of_mut!(PLAYERS) }
}

fn count() -> usize {
    unsafe { COUNT }
}

fn input() -> &'static [u8; 16384] {
    unsafe { &*addr_of_mut!(INPUT) }
}

fn qty_of(p: &Player, item: u32) -> u32 {
    p.ids[..p.n].iter().position(|&id| id == item).map_or(0, |i| p.qty[i])
}

/// Takes `qty` of `item` (the caller has checked there is enough); the ids stay ascending.
fn take(p: &mut Player, item: u32, qty: u32) {
    let Some(i) = p.ids[..p.n].iter().position(|&id| id == item) else { return };
    p.qty[i] -= qty;
    if p.qty[i] == 0 {
        for k in i..p.n - 1 {
            p.ids[k] = p.ids[k + 1];
            p.qty[k] = p.qty[k + 1];
        }
        p.n -= 1;
    }
}

/// Adds `qty` of `item`, keeping ids ascending; false if a new item type would not fit.
fn give(p: &mut Player, item: u32, qty: u32) -> bool {
    if let Some(i) = p.ids[..p.n].iter().position(|&id| id == item) {
        p.qty[i] += qty;
        return true;
    }
    if p.n == MAX_ITEMS {
        return false;
    }
    let mut pos = p.n;
    while pos > 0 && p.ids[pos - 1] > item {
        p.ids[pos] = p.ids[pos - 1];
        p.qty[pos] = p.qty[pos - 1];
        pos -= 1;
    }
    p.ids[pos] = item;
    p.qty[pos] = qty;
    p.n += 1;
    true
}

#[no_mangle]
pub extern "C" fn input_ptr() -> u32 {
    addr_of_mut!(INPUT) as usize as u32
}

#[no_mangle]
pub extern "C" fn output_ptr() -> u32 {
    addr_of_mut!(OUTPUT) as usize as u32
}

/// Loads a snapshot: `count:u32 || (pk:[32] || n:u32 || (id:u32, qty:u32)*)*`.
#[no_mangle]
pub extern "C" fn load(len: u32) -> i32 {
    let buf: &[u8] = &input()[..(len as usize).min(16384)];
    let mut at = 0;
    let Some(n_players) = rd(buf, &mut at) else { return -1 };
    if n_players as usize > MAX_PLAYERS {
        return -1;
    }
    let ps = players();
    for p in ps.iter_mut().take(n_players as usize) {
        let Some(pk) = buf.get(at..at + 32) else { return -1 };
        p.pk.copy_from_slice(pk);
        at += 32;
        let Some(n) = rd(buf, &mut at) else { return -1 };
        if n as usize > MAX_ITEMS {
            return -1;
        }
        p.n = n as usize;
        for i in 0..p.n {
            let (Some(id), Some(q)) = (rd(buf, &mut at), rd(buf, &mut at)) else { return -1 };
            p.ids[i] = id;
            p.qty[i] = q;
        }
    }
    unsafe {
        COUNT = n_players as usize;
        *addr_of_mut!(LAST_GATHER) = [0; MAX_PLAYERS];
    }
    n_players as i32
}

#[no_mangle]
pub extern "C" fn player_count() -> u32 {
    count() as u32
}

/// The player's 32-byte key into the output buffer; 32, or -1.
#[no_mangle]
pub extern "C" fn get_key(idx: u32) -> i32 {
    if idx as usize >= count() {
        return -1;
    }
    let out = unsafe { &mut *addr_of_mut!(OUTPUT) };
    out[..32].copy_from_slice(&players()[idx as usize].pk);
    32
}

#[no_mangle]
pub extern "C" fn get_state(idx: u32) -> i32 {
    let idx = idx as usize;
    if idx >= count() {
        return -1;
    }
    let p = &players()[idx];
    let out = unsafe { &mut *addr_of_mut!(OUTPUT) };
    out[..4].copy_from_slice(&(p.n as u32).to_le_bytes());
    for i in 0..p.n {
        out[4 + 8 * i..8 + 8 * i].copy_from_slice(&p.ids[i].to_le_bytes());
        out[8 + 8 * i..12 + 8 * i].copy_from_slice(&p.qty[i].to_le_bytes());
    }
    (4 + 8 * p.n) as i32
}

#[no_mangle]
pub extern "C" fn trade(from: u32, to: u32, item: u32, qty: u32) -> i32 {
    let (from, to) = (from as usize, to as usize);
    if from >= count() || to >= count() || from == to || qty == 0 {
        return 2;
    }
    let ps = players();
    if qty_of(&ps[from], item) < qty {
        return 1;
    }
    if qty_of(&ps[to], item) == 0 && ps[to].n == MAX_ITEMS {
        return 3;
    }
    take(&mut ps[from], item, qty);
    give(&mut ps[to], item, qty);
    0
}

/// A new player whose 32-byte key is in the input buffer: its index (an existing key gets its own index back),
/// or -1 when the world is full.
#[no_mangle]
pub extern "C" fn join() -> i32 {
    let mut pk = [0u8; 32];
    pk.copy_from_slice(&input()[..32]);
    let ps = players();
    if let Some(i) = ps[..count()].iter().position(|p| p.pk == pk) {
        return i as i32;
    }
    if count() == MAX_PLAYERS {
        return -1;
    }
    let idx = count();
    ps[idx] = Player { pk, ..EMPTY };
    for (item, qty) in STARTER {
        give(&mut ps[idx], item, qty);
    }
    unsafe { COUNT += 1 };
    idx as i32
}

/// One unit of node `node`'s material (1–6), at most once per tick per player.
#[no_mangle]
pub extern "C" fn gather(player: u32, node: u32, tick: u32) -> i32 {
    let i = player as usize;
    if i >= count() {
        return 2;
    }
    if !(EMBER..=ASH).contains(&node) {
        return 5;
    }
    let last = unsafe { &mut *addr_of_mut!(LAST_GATHER) };
    if tick <= last[i] {
        return 4;
    }
    if !give(&mut players()[i], node, 1) {
        return 3;
    }
    last[i] = tick;
    0
}

/// Host bookkeeping: the last tick `player` gathered in, so a host that loads the world per request still
/// enforces one gather per tick. 0 ok, 2 bad index.
#[no_mangle]
pub extern "C" fn restore_tick(player: u32, tick: u32) -> i32 {
    let i = player as usize;
    if i >= count() {
        return 2;
    }
    unsafe { (*addr_of_mut!(LAST_GATHER))[i] = tick };
    0
}

/// Forges recipe `recipe` (1–6): all ingredients or nothing.
#[no_mangle]
pub extern "C" fn craft(player: u32, recipe: u32) -> i32 {
    let i = player as usize;
    if i >= count() {
        return 2;
    }
    let Some((product, needs)) = RECIPES.get((recipe as usize).wrapping_sub(1)) else { return 5 };
    let p = &mut players()[i];
    if needs.iter().any(|&(item, q)| qty_of(p, item) < q) {
        return 1;
    }
    for &(item, q) in needs.iter() {
        take(p, item, q);
    }
    if !give(p, *product, 1) {
        return 3;
    }
    0
}

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(players: &[([u8; 32], &[(u32, u32)])]) -> i32 {
        let mut buf = Vec::new();
        buf.extend_from_slice(&(players.len() as u32).to_le_bytes());
        for (pk, items) in players {
            buf.extend_from_slice(pk);
            buf.extend_from_slice(&(items.len() as u32).to_le_bytes());
            for (id, q) in items.iter() {
                buf.extend_from_slice(&id.to_le_bytes());
                buf.extend_from_slice(&q.to_le_bytes());
            }
        }
        unsafe { (&mut *addr_of_mut!(INPUT))[..buf.len()].copy_from_slice(&buf) };
        load(buf.len() as u32)
    }

    fn items(idx: u32) -> Vec<(u32, u32)> {
        let len = get_state(idx) as usize;
        let out = unsafe { &*addr_of_mut!(OUTPUT) };
        (0..(len - 4) / 8)
            .map(|i| {
                let a = 4 + 8 * i;
                (u32::from_le_bytes(out[a..a + 4].try_into().unwrap()), u32::from_le_bytes(out[a + 4..a + 8].try_into().unwrap()))
            })
            .collect()
    }

    // One world, exercised in sequence: the statics are shared across the process.
    #[test]
    fn the_game_economy() {
        assert_eq!(snapshot(&[([1; 32], &[(EMBER, 6), (ORE, 4)]), ([2; 32], &[(CRYSTAL, 3)])]), 2);

        // Trades conserve items and keep ids ascending.
        assert_eq!(trade(0, 1, ORE, 2), 0);
        assert_eq!(items(0), vec![(EMBER, 6), (ORE, 2)]);
        assert_eq!(items(1), vec![(ORE, 2), (CRYSTAL, 3)]);
        assert_eq!(trade(1, 0, EMBER, 1), 1, "not enough");
        assert_eq!(trade(0, 0, EMBER, 1), 2, "not to yourself");

        // Gathering: once per tick, only real nodes.
        assert_eq!(gather(1, MOONSILK, 1), 0);
        assert_eq!(gather(1, MOONSILK, 1), 4, "same tick");
        assert_eq!(gather(1, 7, 2), 5, "no such node");
        assert_eq!(gather(1, MOONSILK, 2), 0);
        assert_eq!(restore_tick(1, 5), 0);
        assert_eq!(gather(1, MOONSILK, 5), 4, "a restored tick holds");
        assert_eq!(restore_tick(9, 5), 2);

        // Forging: all ingredients or nothing.
        assert_eq!(craft(0, 1), 0, "a lantern from 2 ember + 1 ore");
        assert_eq!(items(0), vec![(EMBER, 4), (ORE, 1), (LANTERN, 1)]);
        assert_eq!(craft(1, 3), 0, "a prism from 3 crystal + 1 moonsilk");
        assert_eq!(items(1), vec![(ORE, 2), (MOONSILK, 1), (PRISM, 1)]);
        assert_eq!(craft(1, 3), 1, "no crystal left");
        assert_eq!(items(1), vec![(ORE, 2), (MOONSILK, 1), (PRISM, 1)], "a failed craft takes nothing");
        assert_eq!(craft(0, 9), 5, "no such recipe");

        // Joining: a starter kit; a returning key gets its own index back.
        unsafe { (&mut *addr_of_mut!(INPUT))[..32].copy_from_slice(&[3; 32]) };
        assert_eq!(join(), 2);
        assert_eq!(items(2), vec![(EMBER, 3), (ORE, 2)]);
        unsafe { (&mut *addr_of_mut!(INPUT))[..32].copy_from_slice(&[1; 32]) };
        assert_eq!(join(), 0);
        assert_eq!(player_count(), 3);
    }
}
