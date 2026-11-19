//! Phase 4 local SQLite + sqlite-vec library, lofty tagger, ebur128 loudness scanner, and CUE sheet parser.

pub mod db;
pub mod scanner;
pub mod watcher;

pub use db::LibraryDb;
pub use scanner::{extract_audio_metadata, scan_folder, ScannerStats};
pub use watcher::LibraryWatcher;
