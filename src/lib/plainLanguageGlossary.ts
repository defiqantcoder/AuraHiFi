/**
 * AuraHiFi Universal Plain-Language Hover Glossary
 * Concise, jargon-free explanations for audiophile, hardware, DSP, library, AI, and store concepts.
 *
 * Each entry explains:
 * - title: Human-readable concept name
 * - whatItIs: Plain, non-jargon explanation of what the concept or hardware feature is
 * - whatItDoes: Plain explanation of exactly what it does in AuraHiFi and why it matters
 */

export interface GlossaryEntry {
  title: string;
  whatItIs: string;
  whatItDoes: string;
}

export type GlossaryTermId =
  | 'bit_perfect'
  | 'spatial_mode'
  | 'signal_path'
  | 'alsa_exclusive'
  | 'reserve_device1'
  | 'udev_hotplug'
  | 'bypass_laptop'
  | 'dsd_native'
  | 'dop'
  | 'volume_lock'
  | 'sofa_hrtf'
  | 'truehd_atmos'
  | 'eac3_joc'
  | 'hdmi_passthrough'
  | 'bs2b_crossfeed'
  | 'parametric_eq'
  | 'autoeq'
  | 'ebu_r128'
  | 'dynamic_range'
  | 'xruns'
  | 'cue_sheet'
  | 'extism_sandbox'
  | 'ed25519_sig'
  | 'chromaprint'
  | 'musicbrainz_rate'
  | 'lrclib'
  | 'gemini_playlist'
  | 'offline_clap_bliss'
  | 'sqlite_vec'
  | 'mpris2'
  | 'rtkit'
  | 'add_music_folder';

export const PLAIN_LANGUAGE_GLOSSARY: Record<GlossaryTermId, GlossaryEntry> = {
  bit_perfect: {
    title: 'Bit-Perfect Playback',
    whatItIs: 'Direct transmission of pure audio data from your files to your DAC without alterations.',
    whatItDoes: 'Completely bypasses software volume, equalizers, resamplers, and OS mixers so every bit reaches your DAC exactly as mastered in the studio.',
  },
  spatial_mode: {
    title: 'Spatial Audio & DSP Mode',
    whatItIs: 'In-process 64-bit studio sound processing for 3D headphone virtualization and room tuning.',
    whatItDoes: 'Renders Dolby Atmos objects, custom HRTF headphone profiles, parametric EQ, and crossfeed with precision volume control.',
  },
  signal_path: {
    title: 'Signal Path Inspector',
    whatItIs: 'A real-time 5-stage verification breakdown of every processing step from file to hardware.',
    whatItDoes: 'Proves whether your audio is untouched Bit-Perfect or processed by DSP, revealing exact sample rates, bit depths, and potential bottlenecks.',
  },
  alsa_exclusive: {
    title: 'ALSA Hardware Exclusive Access',
    whatItIs: 'Direct Linux kernel connection to your USB DAC hardware device (hw:).',
    whatItDoes: 'Streams audio directly to the DAC ring buffer, locking out OS mixing and guaranteeing sample rates up to 768 kHz and DSD without resampling.',
  },
  reserve_device1: {
    title: 'D-Bus ReserveDevice1 Lock',
    whatItIs: 'Standard Linux audio protocol for polite exclusive device reservation.',
    whatItDoes: 'Asks PipeWire and PulseAudio to release only your USB DAC, preventing device busy (EBUSY) errors without shutting down system audio.',
  },
  udev_hotplug: {
    title: 'udev USB DAC Hot-Plug Monitor',
    whatItIs: 'Linux kernel device monitoring service that detects hardware connections.',
    whatItDoes: 'Instantly identifies when a USB DAC is plugged in, probes its hardware capabilities, and safely pauses playback if accidentally disconnected.',
  },
  bypass_laptop: {
    title: 'Laptop Speaker Isolation Policy',
    whatItIs: 'Safety protection guard against accidental sound leakage to internal laptop speakers.',
    whatItDoes: 'If your USB DAC or headphones disconnect, playback pauses immediately rather than blasting loud music through built-in laptop speakers.',
  },
  dsd_native: {
    title: 'Native DSD Playback',
    whatItIs: 'Direct 1-bit Direct Stream Digital audio transmitted in raw hardware format.',
    whatItDoes: 'Streams high-rate DSD64 to DSD512 bitstreams straight to Burr-Brown or AKM DAC silicon without converting to PCM.',
  },
  dop: {
    title: 'DSD over PCM (DoP)',
    whatItIs: 'A standard technique that wraps 1-bit DSD inside standard 24-bit PCM containers.',
    whatItDoes: 'Allows USB DACs without native Linux DSD drivers to play bit-exact DSD by having the DAC unpack the 1-bit stream internally.',
  },
  volume_lock: {
    title: '0.0 dB Bit-Perfect Volume Lock',
    whatItIs: 'Automatic lock that prevents software digital attenuation.',
    whatItDoes: 'Locks software gain at 100% (0.0 dB) to preserve 24-bit/32-bit math and DSD markers. Use your DAC or amplifier volume knob to control listening level.',
  },
  sofa_hrtf: {
    title: 'SOFA HRTF Headphone Virtualization',
    whatItIs: 'Standardized 3D ear acoustic measurement files (AES69 SOFA standard).',
    whatItDoes: 'Calculates how sounds bounce off your head and ears so multi-channel and Atmos music sounds like speakers placed around you in 3D space.',
  },
  truehd_atmos: {
    title: 'Dolby TrueHD Atmos Decoding',
    whatItIs: 'Lossless studio spatial audio containing bed channels and dynamic 3D sound objects.',
    whatItDoes: 'Decodes 7.1.4 spatial beds in real-time, placing individual instruments overhead and around your head with pinpoint accuracy.',
  },
  eac3_joc: {
    title: 'E-AC-3 JOC (Streaming Atmos)',
    whatItIs: 'Enhanced AC-3 Joint Object Coding format used by streaming media services.',
    whatItDoes: 'Extracts spatial audio objects from streaming audio files through optional sandboxed Add-On Store plugins.',
  },
  hdmi_passthrough: {
    title: 'HDMI IEC958 Bitstream Passthrough',
    whatItIs: 'Direct transmission of encoded surround audio over HDMI to an AV receiver.',
    whatItDoes: 'Sends raw TrueHD Atmos bitstreams directly to your home theater receiver or soundbar for hardware multichannel decoding.',
  },
  bs2b_crossfeed: {
    title: 'BS2B Headphone Crossfeed',
    whatItIs: 'Bauer Stereophonic-to-Binaural acoustic crossfeed processing.',
    whatItDoes: 'Subtly blends left and right channels to emulate how speakers sound in a room, dramatically reducing headphone listening fatigue on vintage stereo recordings.',
  },
  parametric_eq: {
    title: '10-Band Parametric EQ',
    whatItIs: 'Precision 64-bit floating-point RBJ biquad audio filter chain.',
    whatItDoes: 'Lets you boost or cut exact audio frequencies with adjustable width (Q-factor) to tailor your listening experience without distortion.',
  },
  autoeq: {
    title: 'AutoEQ Headphone Correction',
    whatItIs: 'Standard acoustic equalization measurements for thousands of headphone models.',
    whatItDoes: 'Corrects headphone frequency imbalances toward the Harman target curve for neutral, reference studio sound.',
  },
  ebu_r128: {
    title: 'EBU R128 Loudness Normalization',
    whatItIs: 'International standard for measuring perceived loudness across songs and albums.',
    whatItDoes: 'Matches track loudness smoothly so quiet tracks and loud masters play at consistent volumes without dynamic compression.',
  },
  dynamic_range: {
    title: 'Dynamic Range (DR Score)',
    whatItIs: 'Measurement of the difference between quiet nuances and loud crescendos in music.',
    whatItDoes: 'Higher scores (DR12+) indicate master pressings with rich dynamics that have not been squashed by the loudness wars.',
  },
  xruns: {
    title: 'ALSA Buffer Xruns (Under/Over-runs)',
    whatItIs: 'A count of audio dropouts caused when the system fails to deliver samples in time.',
    whatItDoes: 'Shows 0 in AuraHiFi thanks to real-time RTKit priority and large lock-free memory ring buffers.',
  },
  cue_sheet: {
    title: 'CUE Sheet Virtual Track Splitter',
    whatItIs: 'Text sheet (.cue) describing track boundaries inside a single long audio file.',
    whatItDoes: 'Splits monolithic CD/vinyl rip images into individual playable songs gaplessly without creating duplicate files on disk.',
  },
  extism_sandbox: {
    title: 'Extism WebAssembly Plugin Sandbox',
    whatItIs: 'Secure Wasm container that isolates add-ons from system memory and files.',
    whatItDoes: 'Runs community metadata, lyrics, and audio tools with zero risk of malware or unauthorized network access.',
  },
  ed25519_sig: {
    title: 'Ed25519 Cryptographic Signature',
    whatItIs: 'High-security digital signature confirming add-on publisher identity.',
    whatItDoes: 'Verifies that add-on code was signed by trusted developers and has not been altered or tampered with before execution.',
  },
  chromaprint: {
    title: 'Chromaprint Audio Fingerprint',
    whatItIs: 'Acoustic waveform identification algorithm developed for AcoustID.',
    whatItDoes: 'Identifies songs by their sound alone, even when filenames and ID3 tags are missing or corrupted.',
  },
  musicbrainz_rate: {
    title: 'MusicBrainz 1 req/s Token Bucket',
    whatItIs: 'Fair-use rate limiter protecting the free community MusicBrainz encyclopedia.',
    whatItDoes: 'Spaces out metadata lookups to ensure compliance with server policies and avoid HTTP 503 throttling errors.',
  },
  lrclib: {
    title: 'LRCLIB Synced Lyrics',
    whatItIs: 'Open-source community database of timestamped song lyrics.',
    whatItDoes: 'Fetches millisecond-accurate lyrics that highlight line-by-line in sync with music playback.',
  },
  gemini_playlist: {
    title: 'Gemini Plain-Language AI Playlists',
    whatItIs: 'Google Gemini AI language model for intelligent music curation.',
    whatItDoes: 'Translates natural conversational prompts (e.g., "warm acoustic jazz for reading") into structured musical playlists from your library.',
  },
  offline_clap_bliss: {
    title: 'Offline Vibe & Acoustic Search',
    whatItIs: 'On-device machine learning models (CLAP embeddings and Bliss audio descriptors).',
    whatItDoes: 'Finds songs with similar rhythm, tempo, and vibe completely offline without uploading your music or personal data.',
  },
  sqlite_vec: {
    title: 'sqlite-vec Vector Search Engine',
    whatItIs: 'High-speed vector similarity extension built into our local SQLite database.',
    whatItDoes: 'Instantly matches audio vibe embeddings and acoustic similarity vectors across tens of thousands of tracks in milliseconds.',
  },
  mpris2: {
    title: 'D-Bus MPRIS2 Media Controls',
    whatItIs: 'Standard Linux desktop media player integration protocol.',
    whatItDoes: 'Allows controlling AuraHiFi from GNOME Shell, KDE taskbars, lock screens, and keyboard media keys.',
  },
  rtkit: {
    title: 'RTKit Real-Time Scheduling',
    whatItIs: 'Linux RealtimeKit privilege broker (org.freedesktop.RealtimeKit1).',
    whatItDoes: 'Grants real-time SCHED_FIFO priority to our audio output thread so system background tasks never cause audio clicks or dropouts.',
  },
  add_music_folder: {
    title: '+ Add Music Folder',
    whatItIs: 'Ubuntu native directory picker backed by tauri-plugin-dialog.',
    whatItDoes: 'Selects music folders on your internal drives or external USB/NAS storage, instantly indexing them into your local SQLite library.',
  },
};

export function getGlossaryEntry(termId: string): GlossaryEntry {
  const normalized = termId.toLowerCase().replace(/[^a-z0-9_]/g, '_') as GlossaryTermId;
  return (
    PLAIN_LANGUAGE_GLOSSARY[normalized] ?? {
      title: termId.replace(/_/g, ' ').toUpperCase(),
      whatItIs: 'Audiophile audio metric or hardware control.',
      whatItDoes: 'Provides verifiable telemetry and control over audio playback in AuraHiFi.',
    }
  );
}
