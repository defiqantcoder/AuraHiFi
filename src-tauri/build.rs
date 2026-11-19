use std::fs;
use std::path::Path;

fn main() {
    // Ensure addons/dist directory exists with files so tauri-build bundle resources glob never fails
    let dist_dir = Path::new("addons/dist");
    if !dist_dir.exists() {
        let _ = fs::create_dir_all(dist_dir);
    }
    let placeholder = dist_dir.join("bundled_addons.json");
    if !placeholder.exists() {
        let _ = fs::write(&placeholder, b"[]\n");
    }

    tauri_build::build();
}
