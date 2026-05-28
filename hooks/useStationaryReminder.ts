"use client";

import { useEffect } from "react";

const STATIONARY_MINUTES = 2;
const STATIONARY_MS = STATIONARY_MINUTES * 60 * 1000;
// Anchor "stationary" radius — must stay within this circle to keep the timer running.
const STATIONARY_RADIUS_M = 40;
// After firing a notification, user must move at least this far before we'll
// consider them stationary again (prevents repeat-fires from GPS jitter).
const RESET_DISTANCE_M = 150;
// Grace window for brief excursions outside the radius (e.g., bathroom/garage
// trip, GPS jitter). Stationary state isn't reset until the user has been
// outside continuously for this long.
const EXIT_GRACE_MS = 90 * 1000;
// How often we re-evaluate the cached position against the elapsed timer.
// We don't request a new fix here — we just consult what `watchPosition`
// last gave us. This avoids the cold-fix timeouts that `getCurrentPosition`
// can hit while still letting the 10-minute counter actually progress when
// the device is genuinely stationary (and therefore not emitting any
// movement-triggered `watchPosition` callbacks).
const TICK_INTERVAL_MS = 30 * 1000;
// If we haven't heard from `watchPosition` in this long, we treat the cached
// fix as stale and skip the dwell evaluation rather than acting on outdated
// data. Set generously so a stationary device — which legitimately stops
// emitting updates — is still considered "here".
const STALE_FIX_MS = 15 * 60 * 1000;

const LOG_PREFIX = "[stationary]";

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type UseStationaryReminderOptions = {
  enabled: boolean;
  userId: string | null | undefined;
};

export function useStationaryReminder({ enabled, userId }: UseStationaryReminderOptions): void {
  useEffect(() => {
    if (!enabled || !userId) return;
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) return;

    console.log(
      `${LOG_PREFIX} starting (${STATIONARY_MINUTES} min threshold, ${TICK_INTERVAL_MS / 1000}s tick)`
    );

    let cancelled = false;
    let watchId: number | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let lastFix: { lat: number; lng: number; at: number } | null = null;
    let anchor: { lat: number; lng: number; at: number } | null = null;
    let outsideSince: number | null = null;
    let notifiedAnchor: { lat: number; lng: number } | null = null;
    let sending = false;

    const sendReminder = async (lat: number, lng: number) => {
      if (sending) return;
      sending = true;
      try {
        console.log(`${LOG_PREFIX} sending reminder for anchor`, { lat, lng });
        const res = await fetch("/api/stationary/reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        });
        if (!res.ok) {
          console.warn(`${LOG_PREFIX} reminder POST failed`, res.status);
        } else {
          let info: unknown = null;
          try {
            info = await res.json();
          } catch {
            // ignore
          }
          console.log(`${LOG_PREFIX} reminder POST ok`, info);
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} reminder POST error`, err);
      } finally {
        sending = false;
      }
    };

    const evaluate = (reason: "watch" | "tick") => {
      if (cancelled) return;
      if (!lastFix) return;

      const now = Date.now();
      const fixAge = now - lastFix.at;
      if (fixAge > STALE_FIX_MS) {
        console.log(
          `${LOG_PREFIX} skipping ${reason}: last fix is ${(fixAge / 1000).toFixed(0)}s old (stale)`
        );
        return;
      }

      const { lat: latitude, lng: longitude } = lastFix;

      if (notifiedAnchor) {
        const movedFromNotified = haversineMeters(
          latitude,
          longitude,
          notifiedAnchor.lat,
          notifiedAnchor.lng
        );
        if (movedFromNotified < RESET_DISTANCE_M) {
          return;
        }
        console.log(
          `${LOG_PREFIX} moved ${movedFromNotified.toFixed(0)}m from last notify — re-arming`
        );
        notifiedAnchor = null;
        anchor = null;
        outsideSince = null;
      }

      if (!anchor) {
        anchor = { lat: latitude, lng: longitude, at: now };
        outsideSince = null;
        console.log(`${LOG_PREFIX} anchor set`, { lat: latitude, lng: longitude });
        return;
      }

      const dFromAnchor = haversineMeters(latitude, longitude, anchor.lat, anchor.lng);
      if (dFromAnchor <= STATIONARY_RADIUS_M) {
        outsideSince = null;
        const elapsed = now - anchor.at;
        const remaining = Math.max(0, STATIONARY_MS - elapsed);
        console.log(
          `${LOG_PREFIX} inside anchor (${dFromAnchor.toFixed(0)}m, fix ${(fixAge / 1000).toFixed(0)}s old) — ${(elapsed / 1000).toFixed(0)}s elapsed, ${(remaining / 1000).toFixed(0)}s remaining (${reason})`
        );
        if (elapsed >= STATIONARY_MS) {
          notifiedAnchor = { lat: anchor.lat, lng: anchor.lng };
          sendReminder(anchor.lat, anchor.lng);
        }
        return;
      }

      if (outsideSince === null) {
        outsideSince = now;
        console.log(
          `${LOG_PREFIX} outside anchor (${dFromAnchor.toFixed(0)}m) — starting grace`
        );
        return;
      }
      if (now - outsideSince >= EXIT_GRACE_MS) {
        console.log(
          `${LOG_PREFIX} exited anchor for >${EXIT_GRACE_MS / 1000}s — resetting`
        );
        anchor = { lat: latitude, lng: longitude, at: now };
        outsideSince = null;
      }
    };

    const onPosition = (pos: GeolocationPosition) => {
      if (cancelled) return;
      lastFix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        at: Date.now(),
      };
      evaluate("watch");
    };

    const onError = (err: GeolocationPositionError) => {
      // Timeouts are common and expected when the device is stationary and
      // there's nothing new to report — don't be noisy about them.
      if (err.code === err.TIMEOUT) {
        console.log(`${LOG_PREFIX} watchPosition timeout (expected when stationary)`);
        return;
      }
      console.warn(`${LOG_PREFIX} geolocation error`, err.code, err.message);
    };

    try {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        // No `timeout` here: we don't need a guaranteed cadence from the
        // watcher — the tick interval drives our dwell evaluation. Omitting
        // the timeout avoids spurious "Timeout expired" errors when the
        // device is sitting still.
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} watchPosition failed to start`, err);
    }

    tickTimer = setInterval(() => evaluate("tick"), TICK_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (tickTimer !== null) clearInterval(tickTimer);
      console.log(`${LOG_PREFIX} stopped`);
    };
  }, [enabled, userId]);
}
