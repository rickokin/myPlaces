"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { SignInButton, SignUpButton, UserButton, Show, useUser } from "@clerk/nextjs";
import { PlaceResult } from "./api/restaurants/route";
import RestaurantCard from "@/components/RestaurantCard";
import LocationError from "@/components/LocationError";
import SavedPlacesTab from "@/components/SavedPlacesTab";
import SearchTab from "@/components/SearchTab";
import NearbyMap from "@/components/NearbyMap";
import PlaceDetailModal from "@/components/PlaceDetailModal";
import { Visit } from "@/types";

type Status = "idle" | "locating" | "loading" | "success" | "error";
type ActiveTab = "nearby" | "saved" | "search";
type NearbyView = "list" | "map";

export type SavedPlaceEntry = {
  name: string;
  vicinity: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  visits: Visit[];
};

const DEFAULT_RADIUS_FT = 300;

export default function HomeClient() {
  const { isSignedIn } = useUser();
  const [status, setStatus] = useState<Status>("idle");
  const [restaurants, setRestaurants] = useState<PlaceResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [radiusFt, setRadiusFt] = useState<number>(DEFAULT_RADIUS_FT);
  const [radiusInput, setRadiusInput] = useState<string>(String(DEFAULT_RADIUS_FT));
  // Map of placeId -> entry; presence in map means the place is saved
  const [savedPlacesData, setSavedPlacesData] = useState<Map<string, SavedPlaceEntry>>(new Map());
  const [activeTab, setActiveTab] = useState<ActiveTab>("nearby");
  const [nearbyView, setNearbyView] = useState<NearbyView>("list");
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [showAbout, setShowAbout] = useState(false);
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
        savedPlaces: {
          placeId: string;
          name: string;
          vicinity: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          visits: Visit[];
        }[];
      };
      const map = new Map<string, SavedPlaceEntry>();
      for (const p of data.savedPlaces) {
        map.set(p.placeId, {
          name: p.name,
          vicinity: p.vicinity,
          city: p.city,
          state: p.state,
          country: p.country,
          visits: p.visits,
        });
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

  const handleSaveToggle = useCallback(async (
    placeId: string,
    save: boolean,
    restaurantOverride?: PlaceResult
  ) => {
    const restaurant = restaurantOverride ?? restaurants.find((r) => r.place_id === placeId);
    if (!restaurant) return;

    // Optimistic update
    setSavedPlacesData((prev) => {
      const next = new Map(prev);
      if (save) {
        next.set(placeId, {
          name: restaurant.name,
          vicinity: restaurant.vicinity ?? null,
          city: restaurant.city ?? null,
          state: restaurant.state ?? null,
          country: restaurant.country ?? null,
          visits: [],
        });
      } else {
        next.delete(placeId);
      }
      return next;
    });

    try {
      let res: Response;
      if (save) {
        res = await fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId,
            name: restaurant.name,
            vicinity: restaurant.vicinity,
            city: restaurant.city,
            state: restaurant.state,
            country: restaurant.country,
          }),
        });
      } else {
        res = await fetch(`/api/places?placeId=${encodeURIComponent(placeId)}`, { method: "DELETE" });
      }
      if (!res.ok) throw new Error("Server error");
    } catch {
      // Revert optimistic update on failure
      setSavedPlacesData((prev) => {
        const next = new Map(prev);
        if (save) {
          next.delete(placeId);
        } else {
          next.set(placeId, {
            name: restaurant.name,
            vicinity: restaurant.vicinity ?? null,
            city: restaurant.city ?? null,
            state: restaurant.state ?? null,
            country: restaurant.country ?? null,
            visits: [],
          });
        }
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
      const existing = next.get(placeId);
      if (existing) {
        next.set(placeId, { ...existing, visits: [...existing.visits, visit] });
      }
      return next;
    });
    return visit;
  }, []);

  const handleEditVisit = useCallback(async (
    visitId: string,
    placeId: string,
    rating: number | null,
    note: string
  ): Promise<Visit> => {
    const res = await fetch("/api/visits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId, rating, note: note || null }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to update visit");
    }
    const { visit } = await res.json() as { visit: Visit };
    setSavedPlacesData((prev) => {
      const next = new Map(prev);
      const existing = next.get(placeId);
      if (existing) {
        next.set(placeId, {
          ...existing,
          visits: existing.visits.map((v) => (v.id === visitId ? visit : v)),
        });
      }
      return next;
    });
    return visit;
  }, []);

  const handleDeleteVisit = useCallback(async (visitId: string, placeId: string) => {
    // Optimistic update
    setSavedPlacesData((prev) => {
      const next = new Map(prev);
      const existing = next.get(placeId);
      if (existing) {
        next.set(placeId, { ...existing, visits: existing.visits.filter((v) => v.id !== visitId) });
      }
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
    if (isSignedIn) getLocation();
  }, [isSignedIn, getLocation]);

  const handleAddressSearch = useCallback(async () => {
    const trimmed = addressInput.trim();
    if (!trimmed) return;
    setAddressSearchError(null);
    setStatus("loading");
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        setAddressSearchError(data.error ?? "Address not found");
        setStatus(coords ? "success" : "error");
        return;
      }
      const { lat, lng, address } = data as { lat: number; lng: number; address: string };
      setCoords({ lat, lng });
      setCurrentAddress(address || trimmed);
      setIsEditingAddress(false);
      fetchRestaurants(lat, lng, radiusFtRef.current);
    } catch {
      setAddressSearchError("Failed to find that address. Please try again.");
      setStatus(coords ? "success" : "error");
    }
  }, [addressInput, coords, fetchRestaurants]);

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
            {activeTab === "nearby" && (status === "success" || status === "error") && (
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
              <UserButton>
                <UserButton.MenuItems>
                  <UserButton.Action
                    label="About"
                    labelIcon={<InfoIcon />}
                    onClick={() => setShowAbout(true)}
                  />
                </UserButton.MenuItems>
              </UserButton>
            </Show>
          </div>
        </div>
        {activeTab === "nearby" && coords && (status === "success" || status === "loading") && (
          <div className="max-w-2xl mx-auto px-4 pb-2">
            {isEditingAddress ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <PinIcon />
                  <input
                    autoFocus
                    type="text"
                    value={addressInput}
                    onChange={(e) => { setAddressInput(e.target.value); setAddressSearchError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddressSearch();
                      if (e.key === "Escape") { setIsEditingAddress(false); setAddressSearchError(null); }
                    }}
                    placeholder="Enter an address or place…"
                    className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddressSearch}
                    disabled={!addressInput.trim()}
                    className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md px-2.5 py-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    Go
                  </button>
                  <button
                    onClick={() => { setIsEditingAddress(false); setAddressSearchError(null); }}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex items-center gap-2 pl-5">
                  {addressSearchError && (
                    <p className="text-xs text-red-500">{addressSearchError}</p>
                  )}
                  <button
                    onClick={() => { setIsEditingAddress(false); setAddressSearchError(null); getLocation(); }}
                    className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    Use my current location
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddressInput(currentAddress ?? ""); setAddressSearchError(null); setIsEditingAddress(true); }}
                className="flex items-center gap-1.5 group w-full text-left"
                title="Change location"
              >
                <PinIcon />
                {currentAddress ? (
                  <span className="text-xs text-gray-600 font-medium group-hover:text-blue-600 transition-colors">
                    {currentAddress}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 italic">Determining address…</span>
                )}
                <EditIcon />
              </button>
            )}
          </div>
        )}

        {/* Tab navigation */}
        <div className="max-w-2xl mx-auto px-4 flex border-t border-gray-100">
          <button
            onClick={() => setActiveTab("nearby")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "nearby"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <MapPinTabIcon />
            Nearby
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "saved"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <BookmarkTabIcon />
            Saved
            {savedPlacesData.size > 0 && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                activeTab === "saved" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
              }`}>
                {savedPlacesData.size}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "search"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <SearchTabIcon />
            Search
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {activeTab === "nearby" && !isSignedIn && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <span className="text-5xl">🔒</span>
            <h2 className="text-lg font-semibold text-gray-800">Sign in to find nearby restaurants</h2>
            <p className="text-sm text-gray-500 max-w-xs">
              Create an account or sign in to discover restaurants near you.
            </p>
          </div>
        )}

        {activeTab === "nearby" && isSignedIn && (
          <>
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
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-600">
                    {restaurants.length} restaurant
                    {restaurants.length !== 1 ? "s" : ""} within{" "}
                    {radiusFt.toLocaleString()} ft
                  </p>
                  <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setNearbyView("list")}
                      title="List view"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        nearbyView === "list"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <ListViewIcon />
                      List
                    </button>
                    <button
                      onClick={() => setNearbyView("map")}
                      title="Map view"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        nearbyView === "map"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <MapViewIcon />
                      Map
                    </button>
                  </div>
                </div>

                {nearbyView === "list" && restaurants.map((r, i) => (
                  <RestaurantCard
                    key={r.place_id}
                    restaurant={r}
                    rank={i + 1}
                    distanceFt={metersToFeet(r.distance ?? 0)}
                    isSaved={savedPlacesData.has(r.place_id)}
                    isSignedIn={!!isSignedIn}
                    visits={savedPlacesData.get(r.place_id)?.visits ?? []}
                    onCardClick={setSelectedPlace}
                    onSaveToggle={handleSaveToggle}
                    onAddVisit={handleAddVisit}
                    onEditVisit={handleEditVisit}
                    onDeleteVisit={handleDeleteVisit}
                  />
                ))}

                {nearbyView === "map" && coords && (
                  <NearbyMap restaurants={restaurants} userCoords={coords} />
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "saved" && (
          <SavedPlacesTab
            savedPlaces={savedPlacesData}
            isSignedIn={!!isSignedIn}
            onSaveToggle={handleSaveToggle}
            onAddVisit={handleAddVisit}
            onEditVisit={handleEditVisit}
            onDeleteVisit={handleDeleteVisit}
          />
        )}

        {activeTab === "search" && (
          <SearchTab
            isSignedIn={!!isSignedIn}
            savedPlacesData={savedPlacesData}
            onSaveToggle={handleSaveToggle}
            onAddVisit={handleAddVisit}
            onEditVisit={handleEditVisit}
            onDeleteVisit={handleDeleteVisit}
            onCardClick={setSelectedPlace}
          />
        )}
      </main>

      {selectedPlace && (
        <PlaceDetailModal
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
        />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
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

function EditIcon() {
  return (
    <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-500 shrink-0 transition-colors ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
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

function MapPinTabIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function BookmarkTabIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function SearchTabIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  );
}

function ListViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function MapViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 text-center">
        <span className="text-4xl block mb-3">🍽️</span>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Nearby Eats</h2>
        <p className="text-sm text-gray-500 mb-4">
          Version {process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown"}
        </p>
        <p className="text-sm text-gray-600 mb-6">
          Discover and save restaurants near your current location.
        </p>
        <button
          onClick={onClose}
          className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-4 py-2 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
