//! The sealed release package and its public commitment.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::game::Player;
use crate::ibe::SealedKey;
use crate::Error;

pub const PACKAGE_VERSION: u32 = 1;

/// Plaintext inside the sealed package: the deterministic server core and the player snapshot.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Package {
    pub v: u32,
    pub game: String,
    pub epoch: u64,
    pub core_wasm_b64: String,
    pub players: Vec<Player>,
}

impl Package {
    pub fn core_wasm(&self) -> Result<Vec<u8>, Error> {
        B64.decode(&self.core_wasm_b64).map_err(|_| Error::BadEncoding("core base64"))
    }
}

/// Public, on-chain-committable description of one sealed epoch.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Commitment {
    pub v: u32,
    pub game: String,
    pub epoch: u64,
    pub predecessor: String,
    pub path: String,
    pub domain_id: u64,
    pub ckd_pk: String,
    #[serde(with = "hex::serde")]
    pub app_id: [u8; 32],
    pub sealed_key: SealedKey,
    #[serde(with = "hex::serde")]
    pub pkg_sha256: [u8; 32],
    #[serde(with = "hex::serde")]
    pub root: [u8; 32],
    #[serde(with = "hex::serde")]
    pub core_sha256: [u8; 32],
    pub players: u32,
}

/// Never published: the package key and the IBE randomness (either opens the package).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SealSecret {
    #[serde(with = "hex::serde")]
    pub k: [u8; 32],
    #[serde(with = "hex::serde")]
    pub r: [u8; 32],
}

pub fn aad(game: &str, epoch: u64) -> Vec<u8> {
    format!("encore-pkg-v1|{game}|{epoch}").into_bytes()
}

pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

/// `nonce(12) || AES-256-GCM(k, plaintext, aad)`.
pub fn seal_bytes(k: &[u8; 32], nonce: &[u8; 12], plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, Error> {
    let cipher = Aes256Gcm::new_from_slice(k).map_err(|_| Error::Aead)?;
    let ct = cipher
        .encrypt(Nonce::from_slice(nonce), Payload { msg: plaintext, aad })
        .map_err(|_| Error::Aead)?;
    Ok([nonce.as_slice(), ct.as_slice()].concat())
}

pub fn open_bytes(k: &[u8; 32], sealed: &[u8], aad: &[u8]) -> Result<Vec<u8>, Error> {
    if sealed.len() < 12 + 16 {
        return Err(Error::Aead);
    }
    let cipher = Aes256Gcm::new_from_slice(k).map_err(|_| Error::Aead)?;
    cipher
        .decrypt(Nonce::from_slice(&sealed[..12]), Payload { msg: &sealed[12..], aad })
        .map_err(|_| Error::Aead)
}
