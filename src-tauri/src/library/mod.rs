//! Phase 4 local SQLite + sqlite-vec library, lofty tagger, ebur128 loudness scanner, and CUE sheet parser.

pub mod db;
pub mod scanner;
pub mod watcher;

pub use db::LibraryDb;
pub use scanner::{scan_folder, extract_audio_metadata, ScannerStats};
pub use watcher::LibraryWatcher;
