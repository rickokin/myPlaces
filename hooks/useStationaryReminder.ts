"use client";

import { useEffect } from "react";

const STATIONARY_MINUTES = 10;
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

    let cancelled = false;
    let watchId: number | null = null;
    let anchor: { lat: number; lng: number; at: number } | null = null;
    let outsideSince: number | null = null;
    let notifiedAnchor: { lat: number; lng: number } | null = null;
    let sending = false;

    const sendReminder = async (lat: number, lng: number) => {
      if (sending) return;
      sending = true;
      try {
        const res = await fetch("/api/stationary/reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        });
        if (!res.ok) {
          console.warn("[useStationaryReminder] reminder POST failed", res.status);
        }
      } catch (err) {
        console.warn("[useStationaryReminder] reminder POST error", err);
      } finally {
        sending = false;
      }
    };

    const onPosition = (pos: GeolocationPosition) => {
      if (cancelled) return;
      const { latitude, longitude } = pos.coords;
      const now = Date.now();

      // If we've fired a notification at an anchor, require the user to move
      // far enough away before we re-arm.
      if (notifiedAnchor) {
        const movedFromNotified = haversineMeters(
          latitude,
          longitude,
          notifiedAnchor.lat,
          notifiedAnchor.lng
        );
        if (movedFromNotified < RESET_DISTANCE_M) {
          // Still essentially at the place we just notified about — do nothing.
          return;
        }
        notifiedAnchor = null;
        anchor = null;
        outsideSince = null;
      }

      if (!anchor) {
        anchor = { lat: latitude, lng: longitude, at: now };
        outsideSince = null;
        return;
      }

      const dFromAnchor = haversineMeters(latitude, longitude, anchor.lat, anchor.lng);
      if (dFromAnchor <= STATIONARY_RADIUS_M) {
        outsideSince = null;
        if (now - anchor.at >= STATIONARY_MS) {
          notifiedAnchor = { lat: anchor.lat, lng: anchor.lng };
          sendReminder(anchor.lat, anchor.lng);
        }
        return;
      }

      // Outside the anchor radius. Allow a grace window to absorb jitter
      // and brief excursions before resetting the timer.
      if (outsideSince === null) {
        outsideSince = now;
        return;
      }
      if (now - outsideSince >= EXIT_GRACE_MS) {
        anchor = { lat: latitude, lng: longitude, at: now };
        outsideSince = null;
      }
    };

    const onError = (err: GeolocationPositionError) => {
      console.warn("[useStationaryReminder] geolocation error", err.code, err.message);
    };

    try {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 30_000,
      });
    } catch (err) {
      console.warn("[useStationaryReminder] watchPosition failed to start", err);
    }

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, userId]);
}
