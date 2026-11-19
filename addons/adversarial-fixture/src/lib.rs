//! Adversarial Wasm fixture for AuraHiFi sandbox isolation and DoS resistance tests.

use extism_pdk::*;
use serde::{Deserialize, Serialize};

#[host_fn]
extern "ExtismHost" {
    fn propose_tag_diff(input: String) -> String;
    fn query_sqlite_vec(input: String) -> String;
    fn read_scoped_credential(input: String) -> String;
}

#[derive(Serialize, Deserialize)]
struct EchoInput {
    pub message: String,
}

#[derive(Serialize, Deserialize)]
struct EchoOutput {
    pub ok: bool,
    pub echo: String,
}

#[plugin_fn]
pub fn echo_benign(input: String) -> FnResult<String> {
    let parsed: EchoInput = serde_json::from_str(&input).unwrap_or(EchoInput {
        message: input.clone(),
    });
    let out = EchoOutput {
        ok: true,
        echo: parsed.message,
    };
    Ok(serde_json::to_string(&out)?)
}

/// Adversarial CPU loop testing fuel exhaustion and timeout
#[plugin_fn]
pub fn infinite_loop(_input: String) -> FnResult<String> {
    let mut x: u64 = 1;
    loop {
        x = std::hint::black_box(x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407));
    }
}

/// Adversarial memory bomb testing memory page caps
#[plugin_fn]
pub fn memory_bomb(_input: String) -> FnResult<String> {
    // Attempt to allocate 512 MB in chunks
    let mut vecs: Vec<Vec<u8>> = Vec::new();
    for _ in 0..512 {
        let chunk = vec![0xAAu8; 1024 * 1024]; // 1 MB chunk
        vecs.push(chunk);
    }
    Ok(format!("allocated_chunks: {}", vecs.len()))
}

/// Adversarial outbound network call to unapproved host
#[plugin_fn]
pub fn illegal_network(_input: String) -> FnResult<String> {
    let req = HttpRequest::new("http://unauthorized.malicious-exfiltrate.local/ping");
    let res = http::request::<()>(&req, None)?;
    Ok(format!("status: {}", res.status_code()))
}

/// Adversarial path-traversal attempt against propose_tag_diff
#[plugin_fn]
pub fn path_traversal_proposal(_input: String) -> FnResult<String> {
    let payload = serde_json::json!({
        "trackId": "../../etc/passwd",
        "source": "malicious-addon",
        "proposedFields": {
            "title": "Exploit"
        }
    });
    let res = unsafe { propose_tag_diff(payload.to_string())? };
    Ok(res)
}

/// Adversarial SQL injection attempt against query_sqlite_vec
#[plugin_fn]
pub fn sql_injection_vector(_input: String) -> FnResult<String> {
    let payload = serde_json::json!({
        "table": "track_bliss_vec; DROP TABLE tracks; --",
        "vector": [0.1, 0.2, 0.3],
        "limit": 10
    });
    let res = unsafe { query_sqlite_vec(payload.to_string())? };
    Ok(res)
}

/// Adversarial credential access to unauthorized keyring scope
#[plugin_fn]
pub fn unauthorized_credential(_input: String) -> FnResult<String> {
    let payload = serde_json::json!({
        "service": "root_master_key"
    });
    let res = unsafe { read_scoped_credential(payload.to_string())? };
    Ok(res)
}
