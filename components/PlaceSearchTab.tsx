"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PlaceResult } from "@/app/api/restaurants/route";
import { Visit } from "@/types";
import { SavedPlaceEntry } from "@/app/home-client";
import RestaurantCard from "./RestaurantCard";

type Status = "idle" | "loading" | "success" | "error";

// Survives navigation to the place detail page (and back) within the same tab.
const STORAGE_KEY = "placeSearchTab.state.v1";

interface PersistedState {
  address: string;
  radiusInput: string;
  results: PlaceResult[];
  resolvedAddress: string | null;
  searchedRadiusFt: number;
  status: "idle" | "success";
}

function loadPersisted(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function persist(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or serialization errors are non-critical.
  }
}

interface Props {
  isSignedIn: boolean;
  savedPlacesData: Map<string, SavedPlaceEntry>;
  onSaveToggle: (placeId: string, save: boolean, restaurant: PlaceResult) => Promise<void>;
  onAddVisit: (placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onEditVisit: (visitId: string, placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onDeleteVisit: (visitId: string, placeId: string) => Promise<void>;
}

const DEFAULT_RADIUS_FT = 1_000;
const MAX_RADIUS_FT = 52_800;
const RESULT_LIMIT = 100;

export default function PlaceSearchTab({
  isSignedIn,
  savedPlacesData,
  onSaveToggle,
  onAddVisit,
  onEditVisit,
  onDeleteVisit,
}: Props) {
  const router = useRouter();
  const persisted = useRef<PersistedState | null>(null);
  if (persisted.current === null) {
    persisted.current = loadPersisted();
  }
  const initial = persisted.current;

  const [address, setAddress] = useState(initial?.address ?? "");
  const [radiusInput, setRadiusInput] = useState<string>(
    initial?.radiusInput ?? String(DEFAULT_RADIUS_FT)
  );
  const [results, setResults] = useState<PlaceResult[]>(initial?.results ?? []);
  const [status, setStatus] = useState<Status>(initial?.status ?? "idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(
    initial?.resolvedAddress ?? null
  );
  const [searchedRadiusFt, setSearchedRadiusFt] = useState<number>(
    initial?.searchedRadiusFt ?? DEFAULT_RADIUS_FT
  );
  const addressRef = useRef<HTMLInputElement>(null);

  // Persist whenever a stable (idle/success) snapshot changes so the user
  // returns to the same results when navigating back from a detail page.
  useEffect(() => {
    if (status !== "success" && status !== "idle") return;
    persist({
      address,
      radiusInput,
      results,
      resolvedAddress,
      searchedRadiusFt,
      status,
    });
  }, [address, radiusInput, results, resolvedAddress, searchedRadiusFt, status]);

  const metersToFeet = (m: number) => m * 3.28084;

  const handleSearch = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed || !isSignedIn) return;

    const parsedRadius = parseInt(radiusInput, 10);
    if (!isFinite(parsedRadius) || parsedRadius < 1) {
      setErrorMessage("Please enter a valid radius.");
      setStatus("error");
      return;
    }
    const radiusFt = Math.min(parsedRadius, MAX_RADIUS_FT);

    setStatus("loading");
    setErrorMessage("");
    setResults([]);

    try {
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(trimmed)}`);
      const geoData = await geoRes.json();
      if (!geoRes.ok) {
        throw new Error(geoData.error ?? "Address not found");
      }
      const { lat, lng, address: formatted } = geoData as {
        lat: number;
        lng: number;
        address: string;
      };
      setResolvedAddress(formatted || trimmed);

      const res = await fetch(
        `/api/restaurants?lat=${lat}&lng=${lng}&radius=${radiusFt}&limit=${RESULT_LIMIT}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to find restaurants");
      }
      const list: PlaceResult[] = data.restaurants ?? [];
      // Sort by distance ascending (closest first), keep up to RESULT_LIMIT.
      const sorted = [...list]
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
        .slice(0, RESULT_LIMIT);
      setResults(sorted);
      setSearchedRadiusFt(radiusFt);
      setStatus("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Search failed");
      setStatus("error");
    }
  }, [address, radiusInput, isSignedIn]);

  const handleSaveToggleForResult = useCallback(
    (placeId: string, save: boolean) => {
      const restaurant = results.find((r) => r.place_id === placeId);
      if (!restaurant) return;
      onSaveToggle(placeId, save, restaurant);
    },
    [results, onSaveToggle]
  );

  const handleCardClick = useCallback(
    (restaurant: PlaceResult) => {
      router.push(
        `/place/${encodeURIComponent(restaurant.place_id)}?from=place-search`
      );
    },
    [router]
  );

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <span className="text-5xl">🔒</span>
        <h2 className="text-lg font-semibold text-gray-800">Sign in to search places</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Create an account or sign in to search for restaurants around a starting point.
        </p>
      </div>
    );
  }

  const isBusy = status === "loading";

  return (
    <div className="space-y-4">
      {/* Starting point + radius */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
          Starting point
        </label>
        <div className="flex items-center gap-2">
          <PinIcon />
          <input
            ref={addressRef}
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Enter an address, city, or place…"
            className="flex-1 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isBusy}
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <label
            htmlFor="place-search-radius"
            className="text-sm font-medium text-gray-700 shrink-0"
          >
            Within:
          </label>
          <input
            id="place-search-radius"
            type="number"
            min="50"
            max={MAX_RADIUS_FT}
            step="50"
            value={radiusInput}
            onChange={(e) => setRadiusInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            disabled={isBusy}
            className="w-24 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-sm text-gray-500">ft</span>
          <button
            onClick={handleSearch}
            disabled={!address.trim() || isBusy}
            className="ml-auto flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md px-3 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <SearchIcon />
            {isBusy ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {/* States */}
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <span className="text-5xl animate-pulse">🔍</span>
          <h2 className="text-lg font-semibold text-gray-800">Searching the area…</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Finding restaurants near &ldquo;{address.trim()}&rdquo;
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <span className="text-5xl">⚠️</span>
          <h2 className="text-lg font-semibold text-gray-800">Search failed</h2>
          <p className="text-sm text-gray-500 max-w-xs">{errorMessage}</p>
          <button
            onClick={handleSearch}
            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {status === "success" && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <span className="text-5xl">🤷</span>
          <h2 className="text-lg font-semibold text-gray-800">No restaurants found</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Nothing within {searchedRadiusFt.toLocaleString()} ft of{" "}
            {resolvedAddress ?? "that location"}. Try a larger radius.
          </p>
        </div>
      )}

      {status === "success" && results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-600">
              {results.length} restaurant{results.length !== 1 ? "s" : ""} within{" "}
              {searchedRadiusFt.toLocaleString()} ft
            </p>
            <p className="text-xs text-gray-400">
              Closest first{results.length >= RESULT_LIMIT ? ` · showing up to ${RESULT_LIMIT}` : ""}
            </p>
          </div>
          {resolvedAddress && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <PinIcon />
              <span className="truncate">From {resolvedAddress}</span>
            </p>
          )}
          {results.map((r, i) => (
            <RestaurantCard
              key={r.place_id}
              restaurant={r}
              rank={i + 1}
              distanceFt={metersToFeet(r.distance ?? 0)}
              isSaved={savedPlacesData.has(r.place_id)}
              isSignedIn={isSignedIn}
              visits={savedPlacesData.get(r.place_id)?.visits ?? []}
              onCardClick={handleCardClick}
              onSaveToggle={handleSaveToggleForResult}
              onAddVisit={onAddVisit}
              onEditVisit={onEditVisit}
              onDeleteVisit={onDeleteVisit}
            />
          ))}
        </div>
      )}

      {status === "idle" && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <span className="text-5xl">📍</span>
          <h2 className="text-lg font-semibold text-gray-800">Search restaurants around an address</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Enter a starting point above to discover restaurants nearby. Tap any result for
            reviews, price, hours, and more.
          </p>
        </div>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
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
