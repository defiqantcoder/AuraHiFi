//! HDMI IEC958 / IEC 61937 bitstream passthrough framer for AV Receivers (`AC3`, `EAC3`,
//! `TRUEHD`, `DTSHD`).
//!
//! When an HDMI AVR endpoint (`iec958_passthrough == true`) is selected and
//! `spatial_config.atmos_mode == "hdmi_iec958_passthrough"`, AuraHiFi encapsulates compressed
//! Dolby Atmos / DTS:X bitstreams into IEC 61937 data bursts with `Pa = 0xF872`, `Pb = 0x4E1F`
//! sync preambles and opens the ALSA `hdmi:CARD=<ID>,DEV=<N>,AES0=0x06` interface with the
//! `IEC958_AES0_NONAUDIO` (`0x02`) status bit set and software volume strictly locked at `0.0 dB`.

use serde::{Deserialize, Serialize};

/// IEC 61937-1 sync word `Pa` (`0xF872`).
pub const IEC61937_SYNC_PA: u16 = 0xF872;
/// IEC 61937-1 sync word `Pb` (`0x4E1F`).
pub const IEC61937_SYNC_PB: u16 = 0x4E1F;

/// IEC958 consumer channel-status byte 0 (`AES0 = 0x06`: `NONAUDIO (0x02) | CON_NOT_COPYRIGHT (0x04)`).
pub const IEC958_AES0_NONAUDIO_PASSTHROUGH: u8 = 0x06;
/// IEC958 consumer channel-status byte 1 (`AES1 = 0x82`: original digital converter).
pub const IEC958_AES1_DEFAULT: u8 = 0x82;
/// IEC958 consumer channel-status byte 2 (`AES2 = 0x00`).
pub const IEC958_AES2_DEFAULT: u8 = 0x00;

/// Supported HDMI IEC 61937 compressed bitstream passthrough codecs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HdmiBitstreamCodec {
    /// Dolby Digital (AC-3) — IEC 61937-2 data type `0x01`, 48 kHz 2-channel container.
    Ac3,
    /// Dolby Digital Plus (E-AC-3 / E-AC-3 JOC Atmos) — IEC 61937-2 data type `0x15`, 192 kHz 2-channel container.
    Eac3,
    /// Dolby TrueHD / Dolby Atmos MAT 2.0 — IEC 61937-2 data type `0x16`, 192 kHz 8-channel HBR container.
    TrueHd,
    /// DTS-HD Master Audio / DTS:X — IEC 61937-5 data type `0x11`, 192 kHz 8-channel HBR container.
    DtsHd,
}

impl HdmiBitstreamCodec {
    /// Detects the HDMI passthrough codec from a track codec tag (`"TrueHD Atmos"`, `"EAC3"`, `"AC3"`, `"DTS-HD"`).
    pub fn from_track_codec(codec: &str) -> Option<Self> {
        let upper = codec.trim().to_ascii_uppercase();
        if upper.contains("TRUEHD") || upper.contains("MLP") || upper == "ATMOS" {
            Some(Self::TrueHd)
        } else if upper.contains("EAC3") || upper.contains("E-AC-3") || upper.contains("DD+") {
            Some(Self::Eac3)
        } else if upper.contains("AC3") || upper.contains("AC-3") {
            Some(Self::Ac3)
        } else if upper.contains("DTS") {
            Some(Self::DtsHd)
        } else {
            None
        }
    }

    /// IEC 61937 burst-info `Pc` low-byte data-type value.
    pub const fn iec61937_data_type(self) -> u16 {
        match self {
            Self::Ac3 => 0x0001,
            Self::Eac3 => 0x0015,
            Self::TrueHd => 0x0016,
            Self::DtsHd => 0x0011,
        }
    }

    /// Required ALSA IEC958 PCM carrier sample rate in Hz (`48_000` for AC-3, `192_000` for E-AC-3 / TrueHD / DTS-HD HBR).
    pub const fn carrier_sample_rate_hz(self) -> u32 {
        match self {
            Self::Ac3 => 48_000,
            Self::Eac3 | Self::TrueHd | Self::DtsHd => 192_000,
        }
    }

    /// Required ALSA IEC958 PCM carrier channel count (`2` for AC-3/E-AC-3, `8` for HBR TrueHD/DTS-HD).
    pub const fn carrier_channels(self) -> u16 {
        match self {
            Self::Ac3 | Self::Eac3 => 2,
            Self::TrueHd | Self::DtsHd => 8,
        }
    }

    /// Total IEC 61937 burst repetition period in bytes (`6,144` for AC-3, `24,576` for E-AC-3, `61,440` for HBR TrueHD/DTS-HD).
    pub const fn burst_period_bytes(self) -> usize {
        match self {
            Self::Ac3 => 1536 * 4,
            Self::Eac3 => 6144 * 4,
            Self::TrueHd | Self::DtsHd => 15360 * 4,
        }
    }

    /// IEC958 channel status byte 3 (`AES3`) encoding the carrier sampling frequency.
    pub const fn iec958_aes3_rate_byte(self) -> u8 {
        match self.carrier_sample_rate_hz() {
            192_000 => 0x0E,
            _ => 0x02, // 48 kHz
        }
    }
}

/// Builds the ALSA HDMI passthrough device identifier with non-audio IEC958 status bits
/// (`hdmi:CARD=<ID>,DEV=<N>,AES0=0x06,AES1=0x82,AES2=0x00,AES3=0x0e`) so the connected AVR
/// immediately switches out of LPCM mode into native Dolby Atmos / TrueHD / DTS-HD decoding.
pub fn format_alsa_hdmi_iec958_device(base_alsa_id: &str, codec: HdmiBitstreamCodec) -> Result<String, String> {
    let trimmed = base_alsa_id.trim();
    if !trimmed.starts_with("hdmi:CARD=") {
        return Err(format!(
            "HDMI IEC958 passthrough requires an 'hdmi:CARD=<ID>,DEV=<N>' endpoint; got '{trimmed}'."
        ));
    }
    let aes3 = codec.iec958_aes3_rate_byte();
    Ok(format!(
        "{trimmed},AES0=0x{IEC958_AES0_NONAUDIO_PASSTHROUGH:02x},AES1=0x{IEC958_AES1_DEFAULT:02x},AES2=0x{IEC958_AES2_DEFAULT:02x},AES3=0x{aes3:02x}"
    ))
}

/// Packs a compressed audio frame (`payload`) into a pre-allocated IEC 61937 burst buffer
/// (`out_burst_bytes.len() >= codec.burst_period_bytes()`).
///
/// Header layout (8 bytes, 16-bit little-endian words for ALSA `S16_LE` IEC958 transmission):
/// - `Pa` (`0xF872`): Sync word 1
/// - `Pb` (`0x4E1F`): Sync word 2
/// - `Pc`: Burst info (IEC 61937 data type)
/// - `Pd`: Payload length in bits (for AC-3) or bytes (for E-AC-3 / TrueHD / DTS-HD)
///
/// Zero heap allocations: writes directly into `out_burst_bytes` and zero-pads the remainder of the burst period.
pub fn pack_iec61937_burst(
    codec: HdmiBitstreamCodec,
    payload: &[u8],
    out_burst_bytes: &mut [u8],
) -> Result<usize, String> {
    let period_bytes = codec.burst_period_bytes();
    if out_burst_bytes.len() < period_bytes {
        return Err(format!(
            "Output buffer ({} bytes) smaller than IEC 61937 burst period ({period_bytes} bytes) for {codec:?}.",
            out_burst_bytes.len()
        ));
    }
    let max_payload = period_bytes - 8;
    if payload.len() > max_payload {
        return Err(format!(
            "Compressed payload ({} bytes) exceeds IEC 61937 maximum burst payload ({max_payload} bytes) for {codec:?}.",
            payload.len()
        ));
    }

    let pc: u16 = codec.iec61937_data_type();
    let pd: u16 = match codec {
        // AC-3 encodes Pd in bits; E-AC-3 / TrueHD / DTS-HD encode Pd in bytes.
        HdmiBitstreamCodec::Ac3 => (payload.len() * 8) as u16,
        HdmiBitstreamCodec::Eac3 | HdmiBitstreamCodec::TrueHd | HdmiBitstreamCodec::DtsHd => {
            payload.len() as u16
        }
    };

    out_burst_bytes[0..2].copy_from_slice(&IEC61937_SYNC_PA.to_le_bytes());
    out_burst_bytes[2..4].copy_from_slice(&IEC61937_SYNC_PB.to_le_bytes());
    out_burst_bytes[4..6].copy_from_slice(&pc.to_le_bytes());
    out_burst_bytes[6..8].copy_from_slice(&pd.to_le_bytes());

    let payload_end = 8 + payload.len();
    out_burst_bytes[8..payload_end].copy_from_slice(payload);
    out_burst_bytes[payload_end..period_bytes].fill(0);

    Ok(period_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_alsa_hdmi_iec958_device_with_nonaudio_aes0_bits() {
        let dev_truehd =
            format_alsa_hdmi_iec958_device("hdmi:CARD=NVidia,DEV=1", HdmiBitstreamCodec::TrueHd)
                .expect("format HDMI device");
        assert_eq!(
            dev_truehd,
            "hdmi:CARD=NVidia,DEV=1,AES0=0x06,AES1=0x82,AES2=0x00,AES3=0x0e"
        );

        let dev_ac3 =
            format_alsa_hdmi_iec958_device("hdmi:CARD=NVidia,DEV=1", HdmiBitstreamCodec::Ac3)
                .expect("format AC3 HDMI device");
        assert!(dev_ac3.ends_with("AES3=0x02"));

        assert!(
            format_alsa_hdmi_iec958_device("hw:CARD=Bifrost2,DEV=0", HdmiBitstreamCodec::TrueHd)
                .is_err()
        );
    }

    #[test]
    fn packs_iec61937_burst_headers_for_ac3_eac3_truehd_and_dtshd() {
        for codec in [
            HdmiBitstreamCodec::Ac3,
            HdmiBitstreamCodec::Eac3,
            HdmiBitstreamCodec::TrueHd,
            HdmiBitstreamCodec::DtsHd,
        ] {
            let period = codec.burst_period_bytes();
            let mut burst = vec![0_u8; period];
            let payload = [0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04];
            let written = pack_iec61937_burst(codec, &payload, &mut burst).expect("pack burst");
            assert_eq!(written, period);

            let pa = u16::from_le_bytes([burst[0], burst[1]]);
            let pb = u16::from_le_bytes([burst[2], burst[3]]);
            let pc = u16::from_le_bytes([burst[4], burst[5]]);
            assert_eq!(pa, IEC61937_SYNC_PA);
            assert_eq!(pb, IEC61937_SYNC_PB);
            assert_eq!(pc, codec.iec61937_data_type());
            assert_eq!(&burst[8..16], &payload);
        }
    }
}
