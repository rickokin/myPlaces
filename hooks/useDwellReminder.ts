"use client";

import { useEffect, useRef } from "react";
import type { PlaceResult } from "@/app/api/restaurants/route";
import type { SavedPlaceEntry } from "@/app/home-client";

const DWELL_MINUTES = 10;
const DWELL_MS = DWELL_MINUTES * 60 * 1000;
// User must remain inside the place's footprint within this many meters.
const INSIDE_RADIUS_M = 35;
// Brief excursions shorter than this don't reset the dwell timer (GPS jitter, bathroom, etc.).
const EXIT_GRACE_MS = 90 * 1000;
// Refresh the nearby list at most this often.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// Refresh the nearby list if the user has moved more than this far from the last fetch center.
const REFETCH_MOVE_M = 200;
// Search radius (feet) for the dwell-detection nearby query. Wider than the default Nearby tab
// so we have candidates even if the user wandered before settling at a place.
const DWELL_RADIUS_FT = 600;

type DwellState = {
  enteredAt: number;
  lastInsideAt: number;
  notified: boolean;
};

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

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dedupeKey(userId: string, placeId: string): string {
  return `nearby-eats:dwell:${userId}:${placeId}:${localDateKey()}`;
}

function alreadyNotifiedToday(userId: string, placeId: string): boolean {
  try {
    return window.localStorage.getItem(dedupeKey(userId, placeId)) === "1";
  } catch {
    return false;
  }
}

function markNotifiedToday(userId: string, placeId: string): void {
  try {
    window.localStorage.setItem(dedupeKey(userId, placeId), "1");
  } catch {
    // ignore
  }
}

export type UseDwellReminderOptions = {
  enabled: boolean;
  userId: string | null | undefined;
  savedPlacesData: Map<string, SavedPlaceEntry>;
};

export function useDwellReminder({ enabled, userId, savedPlacesData }: UseDwellReminderOptions): void {
  // Hold the latest savedPlacesData in a ref so the long-lived watchPosition
  // callback always sees current state without re-subscribing.
  const savedRef = useRef(savedPlacesData);
  savedRef.current = savedPlacesData;

  useEffect(() => {
    if (!enabled || !userId) return;
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) return;

    let cancelled = false;
    let watchId: number | null = null;
    let nearby: PlaceResult[] = [];
    let lastFetchAt = 0;
    let lastFetchCenter: { lat: number; lng: number } | null = null;
    let inFlightFetch: Promise<void> | null = null;
    const dwell = new Map<string, DwellState>();

    const fetchNearby = (lat: number, lng: number): Promise<void> => {
      if (inFlightFetch) return inFlightFetch;
      const p = (async () => {
        try {
          const res = await fetch(
            `/api/restaurants?lat=${lat}&lng=${lng}&radius=${DWELL_RADIUS_FT}`,
            { cache: "no-store" }
          );
          if (!res.ok) return;
          const data = (await res.json()) as { restaurants?: PlaceResult[] };
          if (!cancelled && data.restaurants) {
            nearby = data.restaurants;
            lastFetchAt = Date.now();
            lastFetchCenter = { lat, lng };
          }
        } catch {
          // ignore — try again on next position
        } finally {
          inFlightFetch = null;
        }
      })();
      inFlightFetch = p;
      return p;
    };

    const isEligible = (placeId: string): boolean => {
      const saved = savedRef.current.get(placeId);
      if (!saved) return true; // not saved at all
      return saved.visits.length === 0; // saved but never visited
    };

    const sendReminder = async (place: PlaceResult) => {
      try {
        const res = await fetch("/api/dwell/reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: place.place_id, name: place.name }),
        });
        if (!res.ok) {
          console.warn("[useDwellReminder] reminder POST failed", res.status);
          return;
        }
        markNotifiedToday(userId, place.place_id);
      } catch (err) {
        console.warn("[useDwellReminder] reminder POST error", err);
      }
    };

    const onPosition = async (pos: GeolocationPosition) => {
      if (cancelled) return;
      const { latitude, longitude } = pos.coords;
      const now = Date.now();

      const needsFetch =
        nearby.length === 0 ||
        now - lastFetchAt > REFRESH_INTERVAL_MS ||
        (lastFetchCenter &&
          haversineMeters(latitude, longitude, lastFetchCenter.lat, lastFetchCenter.lng) >
            REFETCH_MOVE_M);

      if (needsFetch) {
        await fetchNearby(latitude, longitude);
      }
      if (cancelled || nearby.length === 0) return;

      // Find the closest place that is within radius.
      let closest: { place: PlaceResult; distance: number } | null = null;
      for (const place of nearby) {
        const loc = place.geometry?.location;
        if (!loc) continue;
        const d = haversineMeters(latitude, longitude, loc.lat, loc.lng);
        if (d <= INSIDE_RADIUS_M && (!closest || d < closest.distance)) {
          closest = { place, distance: d };
        }
      }

      const insidePlaceId = closest?.place.place_id ?? null;

      // Update dwell state for inside place
      if (insidePlaceId) {
        const place = closest!.place;
        if (isEligible(insidePlaceId) && !alreadyNotifiedToday(userId, insidePlaceId)) {
          const state = dwell.get(insidePlaceId);
          if (!state) {
            dwell.set(insidePlaceId, {
              enteredAt: now,
              lastInsideAt: now,
              notified: false,
            });
          } else {
            state.lastInsideAt = now;
            if (!state.notified && now - state.enteredAt >= DWELL_MS) {
              state.notified = true;
              sendReminder(place);
            }
          }
        }
      }

      // Expire any dwell entries that have been outside longer than the grace window.
      for (const [pid, state] of dwell) {
        if (pid === insidePlaceId) continue;
        if (now - state.lastInsideAt > EXIT_GRACE_MS) {
          dwell.delete(pid);
        }
      }
    };

    const onError = (err: GeolocationPositionError) => {
      console.warn("[useDwellReminder] geolocation error", err.code, err.message);
    };

    try {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 30_000,
      });
    } catch (err) {
      console.warn("[useDwellReminder] watchPosition failed to start", err);
    }

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, userId]);
}
