//! Linux `/proc/asound` capability parser and `udev` (`libudev`) hotplug monitor.
//!
//! Identifies external USB DACs vs internal Intel HDA / SOF audio vs HDMI outputs,
//! extracts exact supported sample rates, PCM bit depths, and native DSD formats
//! (such as `DSD_U32_BE`) from `/proc/asound/card<N>/stream0`, and triggers safe
//! pause-on-unplug with zero fallback to internal laptop speakers.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;

use crate::models::{
    AudioDeviceInfo, DsdCapability, HardwareEvent, PlaybackStatus, ReservationStatus,
    SignalPathError, SignalPathErrorCode, TransportType,
};
use crate::state::{now_ms, AppState};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlsaCardEntry {
    pub card_index: u32,
    pub alsa_short_name: String,
    pub driver: String,
    pub short_desc: String,
    pub long_desc: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Stream0Capabilities {
    pub usb_vid_pid: Option<String>,
    pub supported_sample_rates: Vec<u32>,
    pub supported_bit_depths: Vec<u16>,
    pub pcm_formats: Vec<String>,
    pub native_dsd_formats: Vec<String>,
    pub dsd_capability: Option<DsdCapability>,
    pub max_dsd_multiplier: Option<u16>,
}

/// Parses `/proc/asound/cards` into structured card entries.
pub fn parse_proc_asound_cards(contents: &str) -> Vec<AlsaCardEntry> {
    let mut entries = Vec::new();
    let lines: Vec<&str> = contents.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim_start();
        if let Some(bracket_start) = line.find('[') {
            let idx_str = line[..bracket_start].trim();
            if let Ok(card_index) = idx_str.parse::<u32>() {
                if let Some(bracket_end) = line[bracket_start..].find(']') {
                    let alsa_short_name = line[bracket_start + 1..bracket_start + bracket_end]
                        .trim()
                        .to_string();
                    let rest = line[bracket_start + bracket_end + 1..].trim();
                    let rest = rest.strip_prefix(':').unwrap_or(rest).trim();
                    let (driver, short_desc) = match rest.split_once(" - ") {
                        Some((d, s)) => (d.trim().to_string(), s.trim().to_string()),
                        None => (rest.to_string(), alsa_short_name.clone()),
                    };

                    let long_desc = if i + 1 < lines.len()
                        && (lines[i + 1].starts_with("  ") || lines[i + 1].starts_with('\t'))
                    {
                        i += 1;
                        lines[i].trim().to_string()
                    } else {
                        short_desc.clone()
                    };

                    entries.push(AlsaCardEntry {
                        card_index,
                        alsa_short_name,
                        driver,
                        short_desc,
                        long_desc,
                    });
                }
            }
        }
        i += 1;
    }

    entries
}

/// Parses `/proc/asound/card<N>/stream0` for playback sample rates, PCM formats, and native DSD.
pub fn parse_stream0(contents: &str) -> Stream0Capabilities {
    let mut rates = BTreeSet::<u32>::new();
    let mut bit_depths = BTreeSet::<u16>::new();
    let mut pcm_formats = BTreeSet::<String>::new();
    let mut native_dsd_formats = BTreeSet::<String>::new();
    let mut usb_vid_pid = None;
    let mut in_playback = false;
    let mut saw_playback_header = false;

    for raw_line in contents.lines() {
        let line = raw_line.trim();

        // First line often looks like: "Schiit Audio Schiit Bifrost 2/64 at usb-0000:00:14.0-2, high speed : USB Audio"
        if usb_vid_pid.is_none() && line.contains("usb-") {
            if let Some(at_idx) = line.find("at usb-") {
                let tail = &line[at_idx + 3..];
                let token = tail.split(',').next().unwrap_or(tail).trim();
                usb_vid_pid = Some(token.to_string());
            }
        }

        if line.eq_ignore_ascii_case("Playback:") {
            in_playback = true;
            saw_playback_header = true;
            continue;
        }
        if line.eq_ignore_ascii_case("Capture:") {
            in_playback = false;
            continue;
        }

        if saw_playback_header && !in_playback {
            continue;
        }

        if let Some(fmt_rest) = line.strip_prefix("Format:") {
            let fmt = fmt_rest.trim();
            if fmt.contains("SPECIAL") || fmt.contains("DSD_U32") || fmt.contains("DSD_U16") {
                native_dsd_formats.insert(fmt.to_string());
            } else {
                pcm_formats.insert(fmt.to_string());
                if fmt.contains("S16") {
                    bit_depths.insert(16);
                }
                if fmt.contains("S24") {
                    bit_depths.insert(24);
                }
                if fmt.contains("S32") || fmt.contains("FLOAT") {
                    bit_depths.insert(32);
                }
            }
        }

        if let Some(bits_rest) = line.strip_prefix("Bits:") {
            if let Ok(bits) = bits_rest.trim().parse::<u16>() {
                if matches!(bits, 16 | 24 | 32) {
                    bit_depths.insert(bits);
                }
            }
        }

        if let Some(rates_rest) = line.strip_prefix("Rates:") {
            let cleaned = rates_rest.replace("continuous", "");
            if cleaned.contains('-') {
                // Continuous range like "44100 - 384000"
                let parts: Vec<u32> = cleaned
                    .split(|c: char| !c.is_ascii_digit())
                    .filter(|s| !s.is_empty())
                    .filter_map(|s| s.parse::<u32>().ok())
                    .collect();
                if parts.len() >= 2 {
                    let (min_r, max_r) = (parts[0], parts[1]);
                    for &std_r in &[
                        44100_u32, 48000, 88200, 96000, 176400, 192000, 352800, 384000, 705600,
                        768000,
                    ] {
                        if std_r >= min_r && std_r <= max_r {
                            rates.insert(std_r);
                        }
                    }
                }
            } else {
                for tok in cleaned.split(|c: char| c == ',' || c.is_whitespace()) {
                    if let Ok(r) = tok.trim().parse::<u32>() {
                        if r >= 8000 {
                            rates.insert(r);
                        }
                    }
                }
            }
        }
    }

    let max_rate = rates.iter().copied().max().unwrap_or(0);
    let (dsd_capability, max_dsd_multiplier) = if !native_dsd_formats.is_empty() {
        let mult = if max_rate >= 705600 {
            Some(512)
        } else if max_rate >= 352800 {
            Some(256)
        } else if max_rate >= 176400 {
            Some(128)
        } else {
            Some(64)
        };
        (Some(DsdCapability::Native), mult)
    } else if max_rate >= 176400 && bit_depths.contains(&24) {
        let mult = if max_rate >= 705600 {
            Some(256)
        } else if max_rate >= 352800 {
            Some(128)
        } else {
            Some(64)
        };
        (Some(DsdCapability::Dop), mult)
    } else if !rates.is_empty() {
        (Some(DsdCapability::PcmFallback), None)
    } else {
        (None, None)
    };

    Stream0Capabilities {
        usb_vid_pid,
        supported_sample_rates: rates.into_iter().collect(),
        supported_bit_depths: bit_depths.into_iter().collect(),
        pcm_formats: pcm_formats.into_iter().collect(),
        native_dsd_formats: native_dsd_formats.into_iter().collect(),
        dsd_capability,
        max_dsd_multiplier,
    }
}

fn classify_transport(entry: &AlsaCardEntry, has_stream0: bool) -> (TransportType, bool) {
    let driver_l = entry.driver.to_lowercase();
    let desc_l = entry.long_desc.to_lowercase();
    let name_l = entry.alsa_short_name.to_lowercase();

    if driver_l.contains("usb") || has_stream0 {
        (TransportType::Usb, false)
    } else if driver_l.contains("hdmi")
        || name_l.contains("hdmi")
        || name_l.contains("nvidia")
        || desc_l.contains("hdmi")
    {
        (TransportType::Hdmi, false)
    } else {
        (TransportType::Internal, true)
    }
}

/// Enumerates live Linux ALSA devices from `/proc/asound/cards` and `stream0`.
pub fn enumerate_audio_devices() -> Vec<AudioDeviceInfo> {
    let Ok(cards_text) = fs::read_to_string("/proc/asound/cards") else {
        return Vec::new();
    };

    let entries = parse_proc_asound_cards(&cards_text);
    let mut devices = Vec::with_capacity(entries.len());

    for entry in entries {
        let stream0_path = format!("/proc/asound/card{}/stream0", entry.card_index);
        let stream0_contents = fs::read_to_string(&stream0_path).ok();
        let has_stream0 = stream0_contents.is_some();
        let caps = stream0_contents
            .as_deref()
            .map(parse_stream0)
            .unwrap_or_default();

        let (transport_type, is_isolated_internal) = classify_transport(&entry, has_stream0);

        let alsa_id = if transport_type == TransportType::Hdmi {
            format!("hdmi:CARD={},DEV=0", entry.alsa_short_name)
        } else {
            format!("hw:CARD={},DEV=0", entry.alsa_short_name)
        };
        let short_id = if transport_type == TransportType::Hdmi {
            format!("hdmi:{}", entry.alsa_short_name)
        } else {
            format!("hw:{}", entry.alsa_short_name)
        };

        let usbid_path = format!("/proc/asound/card{}/usbid", entry.card_index);
        let usb_vid_pid = fs::read_to_string(&usbid_path)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or(caps.usb_vid_pid);

        let supported_sample_rates = if !caps.supported_sample_rates.is_empty() {
            caps.supported_sample_rates
        } else if transport_type == TransportType::Hdmi {
            vec![44100, 48000, 88200, 96000, 176400, 192000]
        } else {
            vec![44100, 48000]
        };

        let supported_bit_depths = if !caps.supported_bit_depths.is_empty() {
            caps.supported_bit_depths
        } else {
            vec![16, 24]
        };

        let dsd_capability =
            caps.dsd_capability
                .unwrap_or(if transport_type == TransportType::Usb {
                    DsdCapability::PcmFallback
                } else {
                    DsdCapability::None
                });

        let dac_chipset = if !caps.native_dsd_formats.is_empty() {
            format!(
                "{} · Native DSD ({})",
                entry.driver,
                caps.native_dsd_formats.join(", ")
            )
        } else if is_isolated_internal {
            format!("{} (Isolated by Policy)", entry.driver)
        } else {
            entry.driver.clone()
        };

        devices.push(AudioDeviceInfo {
            alsa_id,
            short_id,
            card_index: entry.card_index,
            vendor: entry.driver.clone(),
            display_name: if entry.short_desc.is_empty() {
                entry.alsa_short_name.clone()
            } else {
                entry.short_desc.clone()
            },
            usb_vid_pid,
            transport_type,
            supported_sample_rates,
            supported_bit_depths,
            dsd_capability,
            max_dsd_multiplier: caps.max_dsd_multiplier,
            reservation_status: ReservationStatus::Available,
            holding_process: None,
            holding_pid: None,
            is_isolated_internal,
            supports_hardware_volume: is_isolated_internal,
            iec958_passthrough: transport_type == TransportType::Hdmi,
            stream0_path: if Path::new(&stream0_path).exists() {
                Some(stream0_path)
            } else {
                None
            },
            dac_chipset,
        });
    }

    devices
}

/// Spawns a background OS thread monitoring Linux `udev` subsystem `sound` for USB DAC hotplug.
pub fn spawn_udev_monitor(app_state: AppState) {
    let _ = thread::Builder::new()
        .name("aurahifi-udev-sound".into())
        .spawn(move || {
            let Ok(builder) = udev::MonitorBuilder::new() else {
                return;
            };
            let Ok(builder) = builder.match_subsystem("sound") else {
                return;
            };
            let Ok(socket) = builder.listen() else {
                return;
            };

            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build();
            let Ok(rt) = rt else {
                return;
            };

            loop {
                let mut had_event = false;
                for event in socket.iter() {
                    had_event = true;
                    let action = event
                        .action()
                        .and_then(|a| a.to_str())
                        .unwrap_or("")
                        .to_string();
                    if action != "add" && action != "remove" {
                        continue;
                    }

                    // Give kernel ALSA /proc/asound a brief window to settle after udev notification
                    thread::sleep(Duration::from_millis(120));
                    let live_devices = enumerate_audio_devices();

                    rt.block_on(async {
                        let mut guard = app_state.inner.write().await;

                        // Check if the currently active USB DAC vanished
                        if action == "remove" {
                            if let Some(active_id) = guard.active_device_id.clone() {
                                let still_present =
                                    live_devices.iter().any(|d| d.alsa_id == active_id);
                                if !still_present {
                                    // Immediately halt real-time audio engine & zero buffers — zero leak to laptop speakers
                                    app_state.audio_engine.signal_unplug_halt();
                                    guard.playback.status = PlaybackStatus::Paused;
                                    let display_name = guard
                                        .devices
                                        .iter()
                                        .find(|d| d.alsa_id == active_id)
                                        .map(|d| d.display_name.clone())
                                        .unwrap_or_else(|| active_id.clone());

                                    guard.active_error = Some(SignalPathError {
                                        code: SignalPathErrorCode::DacHotUnplugged,
                                        title: "USB DAC Disconnected — Safely Paused".into(),
                                        message: format!(
                                            "{display_name} unplugged. Zero audio leaked to laptop speakers."
                                        ),
                                        technical_detail: format!("udev remove on {active_id}"),
                                        recovery_action_label: "Reconnect DAC".into(),
                                        retry_after_ms: None,
                                        holding_pid: None,
                                        holding_process_name: None,
                                    });

                                    guard.emit_hardware_event(
                                        HardwareEvent::DacDisconnectedPaused {
                                            timestamp_ms: now_ms(),
                                            alsa_id: active_id,
                                            display_name: display_name.clone(),
                                            fallback_to_internal_speakers: false,
                                            message: format!(
                                                "{display_name} disconnected — playback paused cleanly."
                                            ),
                                        },
                                    );
                                }
                            }
                        } else if action == "add" {
                            for dev in &live_devices {
                                if dev.transport_type == TransportType::Usb
                                    && !guard.devices.iter().any(|d| d.alsa_id == dev.alsa_id)
                                {
                                    guard.emit_hardware_event(HardwareEvent::DacConnected {
                                        timestamp_ms: now_ms(),
                                        alsa_id: dev.alsa_id.clone(),
                                        display_name: dev.display_name.clone(),
                                        message: format!(
                                            "USB DAC detected via udev: {} ({})",
                                            dev.display_name, dev.alsa_id
                                        ),
                                    });
                                }
                            }
                        }

                        if !live_devices.is_empty() {
                            guard.devices = live_devices;
                        }
                    });
                }

                if !had_event {
                    thread::sleep(Duration::from_millis(250));
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_proc_asound_cards_usb_hda_and_hdmi() {
        let sample = r#" 0 [sofhdadsp      ]: sof-hda-dsp - sof-hda-dsp
                      HP-HPEnvyx3602_in_1Laptop14_es0xxx
 1 [NVidia         ]: HDA-Intel - HDA NVidia
                      HDA NVidia at 0xa4000000 irq 17
 2 [Bifrost2       ]: USB-Audio - Schiit Bifrost 2/64
                      Schiit Audio Schiit Bifrost 2/64 at usb-0000:00:14.0-2, high speed
"#;
        let cards = parse_proc_asound_cards(sample);
        assert_eq!(cards.len(), 3);
        assert_eq!(cards[0].card_index, 0);
        assert_eq!(cards[0].alsa_short_name, "sofhdadsp");
        assert_eq!(cards[2].card_index, 2);
        assert_eq!(cards[2].alsa_short_name, "Bifrost2");
        assert_eq!(cards[2].driver, "USB-Audio");
        assert_eq!(cards[2].short_desc, "Schiit Bifrost 2/64");
    }

    #[test]
    fn parses_stream0_rates_and_native_dsd_u32_be() {
        let stream0 = r#"iFi (by AMR) iFi (by AMR) HD+ USB Audio at usb-0000:00:14.0-3, high speed : USB Audio

Playback:
  Status: Stop
  Interface 1
    Altset 1
    Format: S32_LE
    Channels: 2
    Bits: 32
    Rates: 44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000
  Interface 1
    Altset 2
    Format: SPECIAL DSD_U32_BE
    Channels: 2
    Rates: 44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000
Capture:
  Status: Stop
  Interface 2
    Altset 1
    Format: S16_LE
    Rates: 48000
"#;
        let caps = parse_stream0(stream0);
        assert_eq!(
            caps.supported_sample_rates,
            vec![44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000]
        );
        assert!(caps.supported_bit_depths.contains(&32));
        assert_eq!(caps.dsd_capability, Some(DsdCapability::Native));
        assert_eq!(caps.max_dsd_multiplier, Some(256));
        assert!(caps
            .native_dsd_formats
            .iter()
            .any(|f| f.contains("DSD_U32_BE")));
    }
}
