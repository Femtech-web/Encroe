//! Player state, salted leaves and the Merkle commitment `R_n`.
//!
//! A leaf hides a player's inventory (salted); a path reveals only sibling hashes.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Player {
    #[serde(with = "hex::serde")]
    pub pk: [u8; 32],
    /// `(item_id, quantity)`, strictly increasing ids, nonzero quantities.
    pub items: Vec<(u32, u32)>,
    #[serde(with = "hex::serde")]
    pub salt: [u8; 32],
}

/// Canonical state bytes: `n:u32le || (id:u32le, qty:u32le)*`, ids ascending, qty > 0.
pub fn state_bytes(items: &[(u32, u32)]) -> Vec<u8> {
    let mut sorted: Vec<(u32, u32)> = items.iter().copied().filter(|(_, q)| *q > 0).collect();
    sorted.sort_by_key(|(id, _)| *id);
    let mut out = Vec::with_capacity(4 + 8 * sorted.len());
    out.extend_from_slice(&(sorted.len() as u32).to_le_bytes());
    for (id, q) in sorted {
        out.extend_from_slice(&id.to_le_bytes());
        out.extend_from_slice(&q.to_le_bytes());
    }
    out
}

pub fn leaf(game: &str, epoch: u64, pk: &[u8; 32], state_hash: &[u8; 32], salt: &[u8; 32]) -> [u8; 32] {
    Sha256::new()
        .chain_update([0x00])
        .chain_update(b"encore-leaf-v1")
        .chain_update((game.len() as u32).to_le_bytes())
        .chain_update(game.as_bytes())
        .chain_update(epoch.to_le_bytes())
        .chain_update(pk)
        .chain_update(state_hash)
        .chain_update(salt)
        .finalize()
        .into()
}

pub fn player_leaf(game: &str, epoch: u64, p: &Player) -> [u8; 32] {
    let sh: [u8; 32] = Sha256::digest(state_bytes(&p.items)).into();
    leaf(game, epoch, &p.pk, &sh, &p.salt)
}

fn node(l: &[u8; 32], r: &[u8; 32]) -> [u8; 32] {
    Sha256::new().chain_update([0x01]).chain_update(l).chain_update(r).finalize().into()
}

pub fn merkle_root(leaves: &[[u8; 32]]) -> [u8; 32] {
    if leaves.is_empty() {
        return [0u8; 32];
    }
    let mut level = leaves.to_vec();
    while level.len() > 1 {
        level = level
            .chunks(2)
            .map(|c| if c.len() == 2 { node(&c[0], &c[1]) } else { node(&c[0], &c[0]) })
            .collect();
    }
    level[0]
}

/// Sibling hashes bottom-up; `true` when the sibling is on the right.
pub fn merkle_path(leaves: &[[u8; 32]], mut index: usize) -> Vec<([u8; 32], bool)> {
    let mut path = Vec::new();
    let mut level = leaves.to_vec();
    while level.len() > 1 {
        let sib = if index % 2 == 0 { level.get(index + 1).copied().unwrap_or(level[index]) } else { level[index - 1] };
        path.push((sib, index % 2 == 0));
        level = level
            .chunks(2)
            .map(|c| if c.len() == 2 { node(&c[0], &c[1]) } else { node(&c[0], &c[0]) })
            .collect();
        index /= 2;
    }
    path
}

pub fn verify_path(leaf: &[u8; 32], path: &[([u8; 32], bool)], root: &[u8; 32]) -> bool {
    let mut acc = *leaf;
    for (sib, right) in path {
        acc = if *right { node(&acc, sib) } else { node(sib, &acc) };
    }
    &acc == root
}

/// Binary snapshot the core loads: `count:u32le || (pk[32] || state_bytes)*`.
pub fn snapshot_binary(players: &[Player]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&(players.len() as u32).to_le_bytes());
    for p in players {
        out.extend_from_slice(&p.pk);
        out.extend_from_slice(&state_bytes(&p.items));
    }
    out
}
