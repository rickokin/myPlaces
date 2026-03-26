"use client";

import { useState, useCallback, useRef } from "react";
import { PlaceResult } from "@/app/api/restaurants/route";
import { Visit } from "@/types";
import { SavedPlaceEntry } from "@/app/home-client";
import RestaurantCard from "./RestaurantCard";

type SearchStatus = "idle" | "loading" | "success" | "error";

interface Props {
  isSignedIn: boolean;
  savedPlacesData: Map<string, SavedPlaceEntry>;
  onSaveToggle: (placeId: string, save: boolean, restaurant: PlaceResult) => Promise<void>;
  onAddVisit: (placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onEditVisit: (visitId: string, placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onDeleteVisit: (visitId: string, placeId: string) => Promise<void>;
  onCardClick?: (restaurant: PlaceResult) => void;
}

export default function SearchTab({
  isSignedIn,
  savedPlacesData,
  onSaveToggle,
  onAddVisit,
  onEditVisit,
  onDeleteVisit,
  onCardClick,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !isSignedIn) return;
    setStatus("loading");
    setErrorMessage("");
    setResults([]);
    setLastQuery(trimmed);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.restaurants ?? []);
      setStatus("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Search failed");
      setStatus("error");
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleSaveToggleForResult = useCallback(
    (placeId: string, save: boolean) => {
      const restaurant = results.find((r) => r.place_id === placeId);
      if (!restaurant) return;
      onSaveToggle(placeId, save, restaurant);
    },
    [results, onSaveToggle]
  );

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm flex items-center gap-2">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for a restaurant or place…"
          className="flex-1 text-sm border-none outline-none placeholder-gray-400 bg-transparent"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setStatus("idle"); inputRef.current?.focus(); }}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Clear"
          >
            <XIcon />
          </button>
        )}
        <button
          onClick={handleSearch}
          disabled={!query.trim() || status === "loading" || !isSignedIn}
          className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md px-3 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
        >
          {status === "loading" ? "Searching…" : "Search"}
        </button>
      </div>

      {!isSignedIn && status !== "idle" && (
        <p className="text-xs text-center text-gray-400">
          Sign in to search and save places.
        </p>
      )}

      {/* States */}
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <span className="text-5xl animate-pulse">🔍</span>
          <h2 className="text-lg font-semibold text-gray-800">Searching…</h2>
          <p className="text-sm text-gray-500 max-w-xs">Looking up &ldquo;{lastQuery}&rdquo;</p>
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
          <h2 className="text-lg font-semibold text-gray-800">No results found</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            No restaurants matched &ldquo;{lastQuery}&rdquo;. Try a different search.
          </p>
        </div>
      )}

      {status === "success" && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-600">
            {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{lastQuery}&rdquo;
          </p>
          {results.map((r, i) => (
            <RestaurantCard
              key={r.place_id}
              restaurant={r}
              rank={i + 1}
              isSaved={savedPlacesData.has(r.place_id)}
              isSignedIn={isSignedIn}
              visits={savedPlacesData.get(r.place_id)?.visits ?? []}
              onCardClick={onCardClick}
              onSaveToggle={handleSaveToggleForResult}
              onAddVisit={onAddVisit}
              onEditVisit={onEditVisit}
              onDeleteVisit={onDeleteVisit}
            />
          ))}
        </div>
      )}

      {status === "idle" && !isSignedIn && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <span className="text-5xl">🔒</span>
          <h2 className="text-lg font-semibold text-gray-800">Sign in to search</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Create an account or sign in to search for restaurants.
          </p>
        </div>
      )}

      {status === "idle" && isSignedIn && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <span className="text-5xl">🍽️</span>
          <h2 className="text-lg font-semibold text-gray-800">Find a restaurant</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Search by name, cuisine, or location to discover places to eat.
          </p>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
