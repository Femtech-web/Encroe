//! Boneh–Franklin style key sealing to a CKD identity (custom; NEAR provides only the key release).
//!
//! Seal:  U = r*G2,  V = k XOR KDF(e(r*Q, pk)),  Q = H(pk || app_id).
//! Open:  e(sig, U) = e(msk*Q, r*G2) = e(r*Q, pk), so sig recovers k.
//! Knowing r alone also opens the ciphertext, so r is as secret as k.

use ark_bls12_381::{Bls12_381, Fr, G1Affine, G2Affine};
use ark_ec::pairing::{Pairing, PairingOutput};
use ark_ec::{AffineRepr, CurveGroup};
use ark_ff::PrimeField;
use ark_serialize::CanonicalSerialize;
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::ckd::{g1_to_bytes, g2_from_bytes, g2_to_bytes, hash_point};
use crate::Error;

const IBE_SALT: &[u8] = b"encore-ibe-v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SealedKey {
    #[serde(with = "hex::serde")]
    pub u: [u8; 96],
    #[serde(with = "hex::serde")]
    pub v: [u8; 32],
}

impl SealedKey {
    pub fn hash(&self) -> [u8; 32] {
        Sha256::new().chain_update(self.u).chain_update(self.v).finalize().into()
    }
}

/// Reduces 32 bytes to a nonzero scalar; the caller supplies fresh randomness.
pub fn scalar_from_bytes(bytes: &[u8; 32]) -> Result<Fr, Error> {
    let r = Fr::from_be_bytes_mod_order(bytes);
    if r == Fr::from(0u64) {
        return Err(Error::ZeroScalar);
    }
    Ok(r)
}

fn mask(gt: &PairingOutput<Bls12_381>, u: &[u8; 96], q: &G1Affine) -> [u8; 32] {
    let mut gt_bytes = Vec::new();
    gt.serialize_uncompressed(&mut gt_bytes).expect("GT encoding");
    let info = [u.as_slice(), g1_to_bytes(q).as_slice()].concat();
    let hk = Hkdf::<Sha256>::new(Some(IBE_SALT), &gt_bytes);
    let mut out = [0u8; 32];
    hk.expand(&info, &mut out).expect("32-byte expand");
    out
}

pub fn seal_key(pk_compressed: &[u8; 96], app_id: &[u8; 32], k: &[u8; 32], r_bytes: &[u8; 32]) -> Result<SealedKey, Error> {
    let r = scalar_from_bytes(r_bytes)?;
    let pk = g2_from_bytes(pk_compressed)?;
    let q = hash_point(pk_compressed, app_id)?;
    let u_point: G2Affine = (G2Affine::generator() * r).into_affine();
    let u = g2_to_bytes(&u_point);
    let gt = Bls12_381::pairing((q * r).into_affine(), pk);
    let m = mask(&gt, &u, &q);
    let mut v = [0u8; 32];
    for i in 0..32 {
        v[i] = k[i] ^ m[i];
    }
    Ok(SealedKey { u, v })
}

pub fn open_key(pk_compressed: &[u8; 96], app_id: &[u8; 32], sig: &G1Affine, sealed: &SealedKey) -> Result<[u8; 32], Error> {
    let q = hash_point(pk_compressed, app_id)?;
    let u_point = g2_from_bytes(&sealed.u)?;
    let gt = Bls12_381::pairing(*sig, u_point);
    let m = mask(&gt, &sealed.u, &q);
    let mut k = [0u8; 32];
    for i in 0..32 {
        k[i] = sealed.v[i] ^ m[i];
    }
    Ok(k)
}
