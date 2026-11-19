//! Filesystem watcher using `notify` to automatically detect newly dropped audio files in watched library folders.

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

pub struct LibraryWatcher {
    _watcher: RecommendedWatcher,
    pub rx: Receiver<notify::Result<Event>>,
}

impl LibraryWatcher {
    pub fn new() -> notify::Result<Self> {
        let (tx, rx) = channel();

        let watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }

    pub fn watch_folder(&mut self, path: &Path) -> notify::Result<()> {
        if path.exists() {
            self._watcher.watch(path, RecursiveMode::Recursive)?;
        }
        Ok(())
    }

    pub fn unwatch_folder(&mut self, path: &Path) -> notify::Result<()> {
        let _ = self._watcher.unwatch(path);
        Ok(())
    }
}

pub fn is_audio_or_cue_event(event: &Event) -> bool {
    match event.kind {
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
            event.paths.iter().any(|p| {
                if let Some(ext) = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                {
                    matches!(
                        ext.as_str(),
                        "flac"
                            | "wav"
                            | "m4a"
                            | "alac"
                            | "mp3"
                            | "ogg"
                            | "opus"
                            | "wv"
                            | "ape"
                            | "dsf"
                            | "dff"
                            | "thd"
                            | "truehd"
                            | "cue"
                    )
                } else {
                    false
                }
            })
        }
        _ => false,
    }
}
