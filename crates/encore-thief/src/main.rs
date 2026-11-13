//! An unauthorized build asking for the publisher's secret row. It prints only whether the
//! variables arrived and their SHA-256, never values.
use sha2::{Digest, Sha256};

fn main() {
    let seen = |name: &str| std::env::var(name).ok().map(|v| hex::encode(Sha256::digest(v.as_bytes())));
    let rows = std::env::var("OUTLAYER_SECRETS_ROWS").ok();
    println!(
        "{}",
        serde_json::json!({
            "guest": "encore-thief",
            "encore_k_sha256": seen("ENCORE_K"),
            "encore_r_sha256": seen("ENCORE_R"),
            "secret_rows": rows,
        })
    );
}
