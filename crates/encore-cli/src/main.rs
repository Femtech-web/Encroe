//! `encore`: publisher and reproducer tool for the go/no-go experiments.
use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, bail, Context, Result};
use ark_bls12_381::Fr;
use ark_ff::One;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng as AeadRng};
use chacha20poly1305::ChaCha20Poly1305;
use clap::{Parser, Subcommand};
use encore_crypto::ckd::{derive_app_id, g1_from_bytes, g1_to_bytes, near_bls_string, parse_near_bls, unmask_response, verify_release};
use encore_crypto::game::{merkle_path, merkle_root, player_leaf, verify_path, Player};
use encore_crypto::ibe::{open_key, seal_key};
use encore_crypto::package::{aad, open_bytes, seal_bytes, sha256, Commitment, Package, SealSecret, PACKAGE_VERSION};
use encore_verifier::{run, Input, Secret};
use hkdf::Hkdf;
use rand::{rngs::OsRng, Rng, RngCore};
use x25519_dalek::{EphemeralSecret, PublicKey};

#[derive(Parser)]
#[command(name = "encore", about = "Encore: Proof of Continuity experiment tool")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Seal a game package to the contract's CKD identity `(predecessor, path)`.
    Seal {
        #[arg(long)]
        predecessor: String,
        #[arg(long)]
        path: String,
        #[arg(long)]
        domain_id: u64,
        /// The domain's `bls12381g2:<b58>` public key (MPC `public_key {"domain_id": N}`).
        #[arg(long)]
        ckd_pk: String,
        #[arg(long)]
        game: String,
        #[arg(long)]
        epoch: u64,
        #[arg(long)]
        core: PathBuf,
        #[arg(long, default_value_t = 24)]
        players: usize,
        /// The live world's players, `[{"pk": hex, "items": [[id, qty], …]}, …]`, instead of `players` random ones.
        /// Each epoch gets fresh salts, so a leaf hides a player's items until they show their own proof.
        #[arg(long)]
        players_file: Option<PathBuf>,
        /// Public outputs: commitment.json, package.sealed, package.b64, players-public.json.
        #[arg(long)]
        out: PathBuf,
        /// Private output (k, r). Keep outside version control.
        #[arg(long)]
        secret_out: PathBuf,
    },
    /// ECIES-encrypt {ENCORE_K, ENCORE_R} to an OutLayer keystore X25519 public key.
    OutlayerSecret {
        #[arg(long)]
        pubkey: String,
        #[arg(long)]
        secret: PathBuf,
    },
    /// Recover and verify the released key from an MPC CKD response.
    VerifyRelease {
        #[arg(long)]
        commitment: PathBuf,
        #[arg(long)]
        big_y: String,
        #[arg(long)]
        big_c: String,
        /// pv_identity (a = 0) or plain_generator (a = 1)
        #[arg(long)]
        key_mode: String,
    },
    /// Decrypt a sealed package with a released signature and check every committed hash.
    Open {
        #[arg(long)]
        commitment: PathBuf,
        #[arg(long)]
        package: PathBuf,
        #[arg(long)]
        sig: String,
    },
    /// Build the verifier input exactly as the contract does.
    MakeInput {
        #[arg(long)]
        commitment: PathBuf,
        #[arg(long)]
        package_b64: PathBuf,
        #[arg(long)]
        seed: String,
        #[arg(long)]
        released_sig: Option<String>,
    },
    /// Run the verifier natively in secret mode (publisher-side preflight).
    Preflight {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        secret: PathBuf,
    },
    /// Borsh FastFS payloads (OutLayer CLI `upload` format) for `__fastdata_fastfs` transactions.
    FastfsPayloads {
        #[arg(long)]
        file: PathBuf,
        #[arg(long)]
        out_dir: PathBuf,
        /// The file's name on FastFS: `<sha256>.<ext>`.
        #[arg(long, default_value = "wasm")]
        ext: String,
        #[arg(long, default_value = "application/wasm")]
        mime: String,
    },
    /// Check one player's inclusion proof against the commitment root.
    PlayerCheck {
        #[arg(long)]
        commitment: PathBuf,
        #[arg(long)]
        players_public: PathBuf,
        #[arg(long)]
        index: usize,
    },
}

fn read_json<T: serde::de::DeserializeOwned>(p: &PathBuf) -> Result<T> {
    serde_json::from_str(&fs::read_to_string(p).with_context(|| format!("read {}", p.display()))?).context("parse json")
}

fn random_players(n: usize) -> Vec<Player> {
    let mut rng = OsRng;
    let mut players: Vec<Player> = (0..n)
        .map(|_| {
            let mut pk = [0u8; 32];
            let mut salt = [0u8; 32];
            rng.fill_bytes(&mut pk);
            rng.fill_bytes(&mut salt);
            let mut items: Vec<(u32, u32)> = Vec::new();
            for id in 1..=8u32 {
                if rng.gen_bool(0.5) {
                    items.push((id, rng.gen_range(1..=9)));
                }
            }
            if items.is_empty() {
                items.push((1, 1));
            }
            Player { pk, items, salt }
        })
        .collect();
    players.sort_by_key(|p| p.pk);
    players
}

#[derive(serde::Deserialize)]
struct WorldPlayer {
    #[serde(with = "hex::serde")]
    pk: [u8; 32],
    items: Vec<(u32, u32)>,
}

fn world_players(file: &PathBuf) -> Result<Vec<Player>> {
    let world: Vec<WorldPlayer> = read_json(file)?;
    if world.is_empty() || world.len() > 64 {
        return Err(anyhow!("a world has 1 to 64 players, not {}", world.len()));
    }
    let mut players: Vec<Player> = world
        .into_iter()
        .map(|w| {
            let mut items: Vec<(u32, u32)> = w.items.into_iter().filter(|(_, q)| *q > 0).collect();
            items.sort_by_key(|(id, _)| *id);
            let mut salt = [0u8; 32];
            OsRng.fill_bytes(&mut salt);
            Player { pk: w.pk, items, salt }
        })
        .collect();
    if players.iter().any(|p| p.items.len() > 16) {
        return Err(anyhow!("a player holds at most 16 item types"));
    }
    players.sort_by_key(|p| p.pk);
    Ok(players)
}

fn parse_g1_any(s: &str) -> Result<ark_bls12_381::G1Affine> {
    let bytes = if s.starts_with("bls12381g1:") { parse_near_bls(s, "bls12381g1", 48)? } else { hex::decode(s)? };
    Ok(g1_from_bytes(&bytes)?)
}

fn main() -> Result<()> {
    match Cli::parse().cmd {
        Cmd::Seal { predecessor, path, domain_id, ckd_pk, game, epoch, core, players, players_file, out, secret_out } => {
            let pk: [u8; 96] = parse_near_bls(&ckd_pk, "bls12381g2", 96)?.try_into().unwrap();
            let app_id = derive_app_id(&predecessor, &path);
            let core_bytes = fs::read(&core)?;
            let players = match &players_file {
                Some(f) => world_players(f)?,
                None => random_players(players),
            };
            let package = Package { v: PACKAGE_VERSION, game: game.clone(), epoch, core_wasm_b64: B64.encode(&core_bytes), players };
            let mut k = [0u8; 32];
            let mut r = [0u8; 32];
            let mut nonce = [0u8; 12];
            OsRng.fill_bytes(&mut k);
            OsRng.fill_bytes(&mut r);
            OsRng.fill_bytes(&mut nonce);
            let sealed_key = seal_key(&pk, &app_id, &k, &r)?;
            let sealed = seal_bytes(&k, &nonce, &serde_json::to_vec(&package)?, &aad(&game, epoch))?;
            let leaves: Vec<[u8; 32]> = package.players.iter().map(|p| player_leaf(&game, epoch, p)).collect();
            let commitment = Commitment {
                v: PACKAGE_VERSION,
                game: game.clone(),
                epoch,
                predecessor,
                path,
                domain_id,
                ckd_pk,
                app_id,
                sealed_key,
                pkg_sha256: sha256(&sealed),
                root: merkle_root(&leaves),
                core_sha256: sha256(&core_bytes),
                players: package.players.len() as u32,
            };
            let public: Vec<serde_json::Value> = package
                .players
                .iter()
                .enumerate()
                .map(|(i, p)| {
                    serde_json::json!({
                        "index": i, "pk": hex::encode(p.pk), "items": p.items, "salt": hex::encode(p.salt),
                        "leaf": hex::encode(leaves[i]),
                        "path": merkle_path(&leaves, i).iter().map(|(h, right)| serde_json::json!([hex::encode(h), right])).collect::<Vec<_>>(),
                    })
                })
                .collect();
            fs::create_dir_all(&out)?;
            fs::write(out.join("commitment.json"), serde_json::to_string_pretty(&commitment)?)?;
            fs::write(out.join("package.sealed"), &sealed)?;
            fs::write(out.join("package.b64"), B64.encode(&sealed))?;
            fs::write(out.join("players-private-demo.json"), serde_json::to_string_pretty(&public)?)?;
            if let Some(dir) = secret_out.parent() {
                fs::create_dir_all(dir)?;
            }
            fs::write(&secret_out, serde_json::to_string(&SealSecret { k, r })?)?;
            println!("{}", serde_json::to_string_pretty(&commitment)?);
        }
        Cmd::OutlayerSecret { pubkey, secret } => {
            let s: SealSecret = read_json(&secret)?;
            let recipient: [u8; 32] = hex::decode(&pubkey)?.try_into().map_err(|_| anyhow!("pubkey must be 32 bytes"))?;
            let eph = EphemeralSecret::random_from_rng(OsRng);
            let eph_pub = PublicKey::from(&eph);
            let shared = eph.diffie_hellman(&PublicKey::from(recipient));
            let mut key = [0u8; 32];
            Hkdf::<sha2::Sha256>::new(None, shared.as_bytes()).expand(b"outlayer-keystore-v1", &mut key).map_err(|_| anyhow!("hkdf"))?;
            let cipher = ChaCha20Poly1305::new((&key).into());
            let nonce = ChaCha20Poly1305::generate_nonce(&mut AeadRng);
            let plaintext = serde_json::json!({"ENCORE_K": hex::encode(s.k), "ENCORE_R": hex::encode(s.r)}).to_string();
            let ct = cipher.encrypt(&nonce, plaintext.as_bytes()).map_err(|_| anyhow!("encrypt"))?;
            let blob = [&[0x01u8][..], eph_pub.as_bytes(), nonce.as_slice(), &ct].concat();
            println!("{}", B64.encode(blob));
        }
        Cmd::VerifyRelease { commitment, big_y, big_c, key_mode } => {
            let c: Commitment = read_json(&commitment)?;
            let pk: [u8; 96] = parse_near_bls(&c.ckd_pk, "bls12381g2", 96)?.try_into().unwrap();
            let (y, cc) = (parse_g1_any(&big_y)?, parse_g1_any(&big_c)?);
            let a = match key_mode.as_str() {
                "pv_identity" => Fr::from(0u64),
                "plain_generator" => Fr::one(),
                _ => bail!("unknown key mode"),
            };
            let sig = unmask_response(&y, &cc, &a);
            let expected_app_id = derive_app_id(&c.predecessor, &c.path);
            let ok = expected_app_id == c.app_id && verify_release(&pk, &c.app_id, &sig)?;
            println!(
                "{}",
                serde_json::json!({
                    "app_id_matches_predecessor_and_path": expected_app_id == c.app_id,
                    "pairing_e_sig_g2_eq_e_Q_pk": ok,
                    "sig_hex": hex::encode(g1_to_bytes(&sig)),
                    "sig_near": near_bls_string("bls12381g1", &g1_to_bytes(&sig)),
                })
            );
            if !ok {
                bail!("released key does not verify for (predecessor, path)");
            }
        }
        Cmd::Open { commitment, package, sig } => {
            let c: Commitment = read_json(&commitment)?;
            let pk: [u8; 96] = parse_near_bls(&c.ckd_pk, "bls12381g2", 96)?.try_into().unwrap();
            let sig = parse_g1_any(&sig)?;
            if !verify_release(&pk, &c.app_id, &sig)? {
                bail!("signature does not verify");
            }
            let sealed = fs::read(&package)?;
            let k = open_key(&pk, &c.app_id, &sig, &c.sealed_key)?;
            let plain = open_bytes(&k, &sealed, &aad(&c.game, c.epoch))?;
            let p: Package = serde_json::from_slice(&plain)?;
            let leaves: Vec<[u8; 32]> = p.players.iter().map(|pl| player_leaf(&p.game, p.epoch, pl)).collect();
            println!(
                "{}",
                serde_json::json!({
                    "pkg_sha256_matches": sha256(&sealed) == c.pkg_sha256,
                    "core_sha256_matches": sha256(&p.core_wasm()?) == c.core_sha256,
                    "root_matches": merkle_root(&leaves) == c.root,
                    "game": p.game, "epoch": p.epoch, "players": p.players.len(),
                    "recovered_key_sha256": hex::encode(sha256(&k)),
                })
            );
        }
        Cmd::MakeInput { commitment, package_b64, seed, released_sig } => {
            let c: Commitment = read_json(&commitment)?;
            let input = Input {
                v: 1,
                game: c.game,
                epoch: c.epoch,
                predecessor: c.predecessor,
                path: c.path,
                domain_id: c.domain_id,
                ckd_pk: c.ckd_pk,
                app_id: hex::encode(c.app_id),
                sealed_u: hex::encode(c.sealed_key.u),
                sealed_v: hex::encode(c.sealed_key.v),
                pkg_b64: fs::read_to_string(&package_b64)?.trim().to_string(),
                pkg_sha256: hex::encode(c.pkg_sha256),
                root: hex::encode(c.root),
                core_sha256: hex::encode(c.core_sha256),
                seed,
                released_sig,
            };
            println!("{}", serde_json::to_string(&input)?);
        }
        Cmd::Preflight { input, secret } => {
            let i: Input = read_json(&input)?;
            let s: SealSecret = read_json(&secret)?;
            println!("{}", serde_json::to_string_pretty(&run(&i, Some(&Secret { k: s.k, r: s.r })))?);
        }
        Cmd::FastfsPayloads { file, out_dir, ext, mime } => {
            #[derive(borsh::BorshSerialize)]
            struct FileContent { mime_type: String, content: Vec<u8> }
            #[derive(borsh::BorshSerialize)]
            struct Simple { relative_path: String, content: Option<FileContent> }
            #[derive(borsh::BorshSerialize)]
            struct Partial { relative_path: String, offset: u32, full_size: u32, mime_type: String, content_chunk: Vec<u8>, nonce: u32 }
            const CHUNK: usize = 1 << 20;
            let content = fs::read(&file)?;
            let hash = hex::encode(sha256(&content));
            let rel = format!("{hash}.{ext}");
            fs::create_dir_all(&out_dir)?;
            let mut payloads = Vec::new();
            if content.len() <= CHUNK {
                let mut d = vec![0u8];
                d.extend(borsh::to_vec(&Simple { relative_path: rel.clone(), content: Some(FileContent { mime_type: mime, content }) })?);
                payloads.push(d);
            } else {
                let nonce = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs() - 1_769_376_240) as u32;
                let full = content.len() as u32;
                for (i, chunk) in content.chunks(CHUNK).enumerate() {
                    let mut d = vec![1u8];
                    d.extend(borsh::to_vec(&Partial { relative_path: rel.clone(), offset: (i * CHUNK) as u32, full_size: full, mime_type: mime.clone(), content_chunk: chunk.to_vec(), nonce })?);
                    payloads.push(d);
                }
            }
            for (i, p) in payloads.iter().enumerate() {
                fs::write(out_dir.join(format!("payload-{i}.bin")), p)?;
            }
            println!("{}", serde_json::json!({"sha256": hash, "relative_path": rel, "payloads": payloads.len()}));
        }
        Cmd::PlayerCheck { commitment, players_public, index } => {
            let c: Commitment = read_json(&commitment)?;
            let ps: Vec<serde_json::Value> = read_json(&players_public)?;
            let p = &ps[index];
            let player = Player {
                pk: hex::decode(p["pk"].as_str().unwrap())?.try_into().unwrap(),
                items: serde_json::from_value(p["items"].clone())?,
                salt: hex::decode(p["salt"].as_str().unwrap())?.try_into().unwrap(),
            };
            let leaf = player_leaf(&c.game, c.epoch, &player);
            let path: Vec<([u8; 32], bool)> = p["path"]
                .as_array()
                .unwrap()
                .iter()
                .map(|e| (hex::decode(e[0].as_str().unwrap()).unwrap().try_into().unwrap(), e[1].as_bool().unwrap()))
                .collect();
            println!("{}", serde_json::json!({"index": index, "included": verify_path(&leaf, &path, &c.root)}));
        }
    }
    Ok(())
}
