//! Session D-Bus `org.freedesktop.ReserveDevice1.Audio<N>` cooperation via `zbus`.
//!
//! Requests PipeWire / WirePlumber to release ONLY the target USB DAC card index
//! (at priority 10) while keeping internal laptop audio untouched. Never stops or
//! restarts PipeWire services.

use zbus::names::WellKnownName;
use zbus::{interface, Connection};

const RESERVE_PRIORITY: i32 = 10;

/// Minimal D-Bus object exported by AuraHiFi while it holds a card reservation.
struct AuraReserveObject {
    card_index: u32,
}

#[interface(name = "org.freedesktop.ReserveDevice1")]
impl AuraReserveObject {
    #[zbus(property)]
    fn priority(&self) -> i32 {
        RESERVE_PRIORITY
    }

    #[zbus(property)]
    fn application_name(&self) -> String {
        "AuraHiFi".into()
    }

    #[zbus(property)]
    fn application_device_name(&self) -> String {
        format!("Audio{}", self.card_index)
    }

    /// Decline lower-priority requests while AuraHiFi is actively streaming bit-perfect audio.
    async fn request_release(&self, priority: i32) -> bool {
        priority > RESERVE_PRIORITY
    }
}

/// Active D-Bus reservation handle for `org.freedesktop.ReserveDevice1.Audio<card_index>`.
pub struct DbusDeviceReservation {
    connection: Connection,
    bus_name: String,
    card_index: u32,
}

impl DbusDeviceReservation {
    /// Requests PipeWire/WirePlumber to release `Audio<card_index>` via `RequestRelease(10)`
    /// and claims the well-known name on the user session D-Bus.
    pub async fn acquire(card_index: u32) -> Result<Self, String> {
        let connection = Connection::session()
            .await
            .map_err(|e| format!("Failed to connect to session D-Bus: {e}"))?;

        let bus_name = format!("org.freedesktop.ReserveDevice1.Audio{card_index}");
        let object_path = format!("/org/freedesktop/ReserveDevice1/Audio{card_index}");

        // Ask current owner (e.g. PipeWire/WirePlumber) to release this card gracefully.
        let _ = connection
            .call_method(
                Some(bus_name.as_str()),
                object_path.as_str(),
                Some("org.freedesktop.ReserveDevice1"),
                "RequestRelease",
                &(RESERVE_PRIORITY,),
            )
            .await;

        // Export our ReserveDevice1 object and request the well-known name.
        let _ = connection
            .object_server()
            .at(object_path.as_str(), AuraReserveObject { card_index })
            .await;

        let well_known = WellKnownName::try_from(bus_name.as_str())
            .map_err(|e| format!("Invalid D-Bus reservation name {bus_name}: {e}"))?;

        connection
            .request_name(well_known)
            .await
            .map_err(|e| format!("Failed to claim {bus_name} on session D-Bus: {e}"))?;

        Ok(Self {
            connection,
            bus_name,
            card_index,
        })
    }

    pub fn card_index(&self) -> u32 {
        self.card_index
    }

    pub fn bus_name(&self) -> &str {
        &self.bus_name
    }

    /// Releases the well-known name so PipeWire can reclaim the USB DAC cleanly.
    pub async fn release(self) -> Result<(), String> {
        let well_known = WellKnownName::try_from(self.bus_name.as_str())
            .map_err(|e| format!("Invalid D-Bus name {}: {e}", self.bus_name))?;
        self.connection
            .release_name(well_known)
            .await
            .map(|_| ())
            .map_err(|e| format!("Failed to release {}: {e}", self.bus_name))
    }
}

/// Non-destructive probe verifying the session D-Bus is reachable for `ReserveDevice1`.
pub async fn probe_dbus_reservation(card_index: u32) -> Result<bool, String> {
    let connection = Connection::session()
        .await
        .map_err(|e| format!("Session D-Bus unavailable: {e}"))?;
    let bus_name = format!("org.freedesktop.ReserveDevice1.Audio{card_index}");
    let _ = WellKnownName::try_from(bus_name.as_str())
        .map_err(|e| format!("Invalid bus name {bus_name}: {e}"))?;
    Ok(connection.unique_name().is_some())
}
