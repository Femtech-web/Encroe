//! A deterministic inventory/trade core. ABI (all u32/i32):
//! `input_ptr()`, `output_ptr()`, `load(len) -> count|-1`, `player_count()`,
//! `get_state(idx) -> len|-1` (canonical state bytes into the output buffer),
//! `trade(from, to, item, qty) -> 0 ok | 1 insufficient | 2 bad index | 3 inventory full`.
#![no_std]

use core::ptr::addr_of_mut;

const MAX_PLAYERS: usize = 64;
const MAX_ITEMS: usize = 16;

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

fn rd(buf: &[u8], at: &mut usize) -> Option<u32> {
    let b = buf.get(*at..*at + 4)?;
    *at += 4;
    Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn players() -> &'static mut [Player; MAX_PLAYERS] {
    unsafe { &mut *addr_of_mut!(PLAYERS) }
}

#[no_mangle]
pub extern "C" fn input_ptr() -> u32 {
    addr_of_mut!(INPUT) as u32
}

#[no_mangle]
pub extern "C" fn output_ptr() -> u32 {
    addr_of_mut!(OUTPUT) as u32
}

#[no_mangle]
pub extern "C" fn load(len: u32) -> i32 {
    let input: &[u8; 16384] = unsafe { &*addr_of_mut!(INPUT) };
    let buf: &[u8] = &input[..(len as usize).min(16384)];
    let mut at = 0;
    let Some(count) = rd(buf, &mut at) else { return -1 };
    if count as usize > MAX_PLAYERS {
        return -1;
    }
    let ps = players();
    for p in ps.iter_mut().take(count as usize) {
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
    unsafe { COUNT = count as usize };
    count as i32
}

#[no_mangle]
pub extern "C" fn player_count() -> u32 {
    unsafe { COUNT as u32 }
}

#[no_mangle]
pub extern "C" fn get_state(idx: u32) -> i32 {
    let idx = idx as usize;
    if idx >= unsafe { COUNT } {
        return -1;
    }
    let p = &players()[idx];
    let out = unsafe { &mut *addr_of_mut!(OUTPUT) };
    out[..4].copy_from_slice(&(p.n as u32).to_le_bytes());
    for i in 0..p.n {
        let mut q = p.qty[i];
        if cfg!(feature = "broken") && idx % 3 == 0 {
            q += 1;
        }
        out[4 + 8 * i..8 + 8 * i].copy_from_slice(&p.ids[i].to_le_bytes());
        out[8 + 8 * i..12 + 8 * i].copy_from_slice(&q.to_le_bytes());
    }
    (4 + 8 * p.n) as i32
}

fn find(p: &Player, item: u32) -> Option<usize> {
    p.ids[..p.n].iter().position(|&id| id == item)
}

#[no_mangle]
pub extern "C" fn trade(from: u32, to: u32, item: u32, qty: u32) -> i32 {
    let (from, to) = (from as usize, to as usize);
    let count = unsafe { COUNT };
    if from >= count || to >= count || from == to || qty == 0 {
        return 2;
    }
    let ps = players();
    let Some(i) = find(&ps[from], item) else { return 1 };
    if ps[from].qty[i] < qty {
        return 1;
    }
    let receiver = &ps[to];
    let j = find(receiver, item);
    if j.is_none() && receiver.n == MAX_ITEMS {
        return 3;
    }
    ps[from].qty[i] -= qty;
    if ps[from].qty[i] == 0 {
        let src = &mut ps[from];
        for k in i..src.n - 1 {
            src.ids[k] = src.ids[k + 1];
            src.qty[k] = src.qty[k + 1];
        }
        src.n -= 1;
    }
    let dst = &mut ps[to];
    match j {
        Some(j) => dst.qty[j] += qty,
        None => {
            let mut pos = dst.n;
            while pos > 0 && dst.ids[pos - 1] > item {
                dst.ids[pos] = dst.ids[pos - 1];
                dst.qty[pos] = dst.qty[pos - 1];
                pos -= 1;
            }
            dst.ids[pos] = item;
            dst.qty[pos] = qty;
            dst.n += 1;
        }
    }
    0
}

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
