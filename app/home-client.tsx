"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { SignInButton, SignUpButton, UserButton, Show, useUser } from "@clerk/nextjs";
import { PlaceResult } from "./api/restaurants/route";
import RestaurantCard from "@/components/RestaurantCard";
import LocationError from "@/components/LocationError";
import { Visit } from "@/types";

type Status = "idle" | "locating" | "loading" | "success" | "error";

const DEFAULT_RADIUS_FT = 300;

export default function HomeClient() {
  const { isSignedIn } = useUser();
  const [status, setStatus] = useState<Status>("idle");
  const [restaurants, setRestaurants] = useState<PlaceResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [radiusFt, setRadiusFt] = useState<number>(DEFAULT_RADIUS_FT);
  const [radiusInput, setRadiusInput] = useState<string>(String(DEFAULT_RADIUS_FT));
  // Map of placeId -> visits array; presence in map means the place is saved
  const [savedPlacesData, setSavedPlacesData] = useState<Map<string, Visit[]>>(new Map());
  const radiusFtRef = useRef<number>(DEFAULT_RADIUS_FT);

  const fetchRestaurants = useCallback(
    async (lat: number, lng: number, radius: number) => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/restaurants?lat=${lat}&lng=${lng}&radius=${radius}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load restaurants");
        }
        setRestaurants(data.restaurants);
        setStatus("success");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to load restaurants");
        setStatus("error");
      }
    },
    []
  );

  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      setCurrentAddress(data.address ?? null);
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  const fetchSavedPlaces = useCallback(async () => {
    try {
      const res = await fetch("/api/places");
      if (!res.ok) return;
      const data = await res.json() as {
        savedPlaces: { placeId: string; name: string; visits: Visit[] }[];
      };
      const map = new Map<string, Visit[]>();
      for (const p of data.savedPlaces) {
        map.set(p.placeId, p.visits);
      }
      setSavedPlacesData(map);
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) fetchSavedPlaces();
    else setSavedPlacesData(new Map());
  }, [isSignedIn, fetchSavedPlaces]);

  const handleSaveToggle = useCallback(async (placeId: string, save: boolean) => {
    const restaurant = restaurants.find((r) => r.place_id === placeId);
    if (!restaurant) return;

    // Optimistic update
    setSavedPlacesData((prev) => {
      const next = new Map(prev);
      if (save) {
        next.set(placeId, []);
      } else {
        next.delete(placeId);
      }
      return next;
    });

    try {
      if (save) {
        await fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId, name: restaurant.name, vicinity: restaurant.vicinity }),
        });
      } else {
        await fetch(`/api/places?placeId=${encodeURIComponent(placeId)}`, { method: "DELETE" });
      }
    } catch {
      // Revert optimistic update on failure
      setSavedPlacesData((prev) => {
        const next = new Map(prev);
        if (save) next.delete(placeId);
        else next.set(placeId, []);
        return next;
      });
    }
  }, [restaurants]);

  const handleAddVisit = useCallback(async (
    placeId: string,
    rating: number | null,
    note: string
  ): Promise<Visit> => {
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId, rating, note: note || null }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to save visit");
    }
    const { visit } = await res.json() as { visit: Visit };
    setSavedPlacesData((prev) => {
      const next = new Map(prev);
      const existing = next.get(placeId) ?? [];
      next.set(placeId, [...existing, visit]);
      return next;
    });
    return visit;
  }, []);

  const handleDeleteVisit = useCallback(async (visitId: string, placeId: string) => {
    // Optimistic update
    setSavedPlacesData((prev) => {
      const next = new Map(prev);
      const existing = next.get(placeId) ?? [];
      next.set(placeId, existing.filter((v) => v.id !== visitId));
      return next;
    });

    try {
      const res = await fetch(`/api/visits?visitId=${encodeURIComponent(visitId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete visit");
    } catch {
      // Revert
      await fetchSavedPlaces();
    }
  }, [fetchSavedPlaces]);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your browser.");
      setStatus("error");
      return;
    }
    setStatus("locating");
    setCurrentAddress(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        fetchRestaurants(latitude, longitude, radiusFtRef.current);
        fetchAddress(latitude, longitude);
      },
      (err) => {
        let message = "Unable to retrieve your location.";
        if (err.code === err.PERMISSION_DENIED) {
          message = "Location access was denied. Please allow location access in your browser settings and try again.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          message = "Location information is unavailable.";
        } else if (err.code === err.TIMEOUT) {
          message = "Location request timed out. Please try again.";
        }
        setErrorMessage(message);
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [fetchRestaurants, fetchAddress]);

  useEffect(() => {
    getLocation();
  }, [getLocation]);

  const handleSearch = useCallback(() => {
    const parsed = parseInt(radiusInput, 10);
    if (isNaN(parsed) || parsed < 1) return;
    radiusFtRef.current = parsed;
    setRadiusFt(parsed);
    if (coords) {
      fetchRestaurants(coords.lat, coords.lng, parsed);
    } else {
      getLocation();
    }
  }, [radiusInput, coords, fetchRestaurants, getLocation]);

  const metersToFeet = (m: number) => m * 3.28084;
  const isBusy = status === "locating" || status === "loading";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍽️</span>
            <h1 className="text-xl font-bold text-gray-900">Nearby Eats</h1>
          </div>
          <div className="flex items-center gap-3">
            {(status === "success" || status === "error") && (
              <button
                onClick={getLocation}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <RefreshIcon />
                Refresh
              </button>
            )}
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors">
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
        {coords && (status === "success" || status === "loading") && (
          <div className="max-w-2xl mx-auto px-4 pb-2 flex items-center gap-1.5">
            <PinIcon />
            {currentAddress ? (
              <p className="text-xs text-gray-600 font-medium">{currentAddress}</p>
            ) : (
              <p className="text-xs text-gray-400 italic">Determining address…</p>
            )}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Radius control */}
        <div className="flex items-center gap-2 mb-5 bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <label
            htmlFor="radius-input"
            className="text-sm font-medium text-gray-700 shrink-0"
          >
            Search radius:
          </label>
          <div className="flex items-center gap-1.5 flex-1">
            <input
              id="radius-input"
              type="number"
              min="50"
              max="26400"
              step="50"
              value={radiusInput}
              onChange={(e) => setRadiusInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              disabled={isBusy}
              className="w-24 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-500">ft</span>
          </div>
          <button
            onClick={handleSearch}
            disabled={isBusy}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md px-3 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <SearchIcon />
            Search
          </button>
        </div>

        {status === "locating" && (
          <StatusCard
            icon="📍"
            title="Finding your location…"
            subtitle="Please allow location access when prompted"
            pulse
          />
        )}

        {status === "loading" && (
          <StatusCard
            icon="🔍"
            title="Searching for restaurants…"
            subtitle={`Looking within ${radiusFt.toLocaleString()} feet of you`}
            pulse
          />
        )}

        {status === "error" && (
          <LocationError message={errorMessage} onRetry={getLocation} />
        )}

        {status === "success" && restaurants.length === 0 && (
          <StatusCard
            icon="🤷"
            title="No restaurants found nearby"
            subtitle={`There are no restaurants within ${radiusFt.toLocaleString()} feet of your current location`}
          />
        )}

        {status === "success" && restaurants.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-600">
              {restaurants.length} restaurant
              {restaurants.length !== 1 ? "s" : ""} within{" "}
              {radiusFt.toLocaleString()} ft
            </p>
            {restaurants.map((r, i) => (
              <RestaurantCard
                key={r.place_id}
                restaurant={r}
                rank={i + 1}
                distanceFt={metersToFeet(r.distance ?? 0)}
                isSaved={savedPlacesData.has(r.place_id)}
                isSignedIn={!!isSignedIn}
                visits={savedPlacesData.get(r.place_id) ?? []}
                onSaveToggle={handleSaveToggle}
                onAddVisit={handleAddVisit}
                onDeleteVisit={handleDeleteVisit}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  subtitle,
  pulse = false,
}: {
  icon: string;
  title: string;
  subtitle: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <span className={`text-5xl ${pulse ? "animate-pulse" : ""}`}>{icon}</span>
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500 max-w-xs">{subtitle}</p>
    </div>
  );
}

function PinIcon() {
  return (
    <svg className="w-3 h-3 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  );
}
