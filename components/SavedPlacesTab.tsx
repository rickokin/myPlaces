"use client";

import { useState, useMemo } from "react";
import { SavedPlaceEntry } from "@/app/home-client";
import { Visit } from "@/types";

interface Props {
  savedPlaces: Map<string, SavedPlaceEntry>;
  isSignedIn: boolean;
  onSaveToggle?: (placeId: string, saved: boolean) => void;
  onAddVisit?: (placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onEditVisit?: (visitId: string, placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onDeleteVisit?: (visitId: string, placeId: string) => Promise<void>;
}

function avgRating(visits: Visit[]): number | null {
  const rated = visits.filter((v) => v.rating !== null);
  if (rated.length === 0) return null;
  return rated.reduce((sum, v) => sum + (v.rating ?? 0), 0) / rated.length;
}

export default function SavedPlacesTab({
  savedPlaces,
  isSignedIn,
  onSaveToggle,
  onAddVisit,
  onEditVisit,
  onDeleteVisit,
}: Props) {
  const [filterCountry, setFilterCountry] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");

  const entries = useMemo(
    () => Array.from(savedPlaces.entries()).map(([placeId, entry]) => ({ placeId, ...entry })),
    [savedPlaces]
  );

  const countries = useMemo(
    () => [...new Set(entries.map((e) => e.country).filter(Boolean) as string[])].sort(),
    [entries]
  );

  const states = useMemo(() => {
    const base = filterCountry ? entries.filter((e) => e.country === filterCountry) : entries;
    return [...new Set(base.map((e) => e.state).filter(Boolean) as string[])].sort();
  }, [entries, filterCountry]);

  const cities = useMemo(() => {
    let base = entries;
    if (filterCountry) base = base.filter((e) => e.country === filterCountry);
    if (filterState) base = base.filter((e) => e.state === filterState);
    return [...new Set(base.map((e) => e.city).filter(Boolean) as string[])].sort();
  }, [entries, filterCountry, filterState]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filterCountry) result = result.filter((e) => e.country === filterCountry);
    if (filterState) result = result.filter((e) => e.state === filterState);
    if (filterCity) result = result.filter((e) => e.city === filterCity);
    return result.sort((a, b) => {
      const ra = avgRating(a.visits);
      const rb = avgRating(b.visits);
      if (ra === null && rb === null) return a.name.localeCompare(b.name);
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra;
    });
  }, [entries, filterCountry, filterState, filterCity]);

  const handleCountryChange = (val: string) => {
    setFilterCountry(val);
    setFilterState("");
    setFilterCity("");
  };

  const handleStateChange = (val: string) => {
    setFilterState(val);
    setFilterCity("");
  };

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <span className="text-5xl">🔒</span>
        <h2 className="text-lg font-semibold text-gray-800">Sign in to see saved places</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Create an account or sign in to save restaurants and track your visits.
        </p>
      </div>
    );
  }

  if (savedPlaces.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <span className="text-5xl">🔖</span>
        <h2 className="text-lg font-semibold text-gray-800">No saved restaurants yet</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Browse the Nearby tab and tap Save on any restaurant to add it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="filter-country" className="text-xs text-gray-500 mb-1 block">
              Country
            </label>
            <select
              id="filter-country"
              value={filterCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-state" className="text-xs text-gray-500 mb-1 block">
              State / Region
            </label>
            <select
              id="filter-state"
              value={filterState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-city" className="text-xs text-gray-500 mb-1 block">
              City
            </label>
            <select
              id="filter-city"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {(filterCountry || filterState || filterCity) && (
          <button
            onClick={() => { setFilterCountry(""); setFilterState(""); setFilterCity(""); }}
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-sm font-medium text-gray-600">
        {filtered.length} saved restaurant{filtered.length !== 1 ? "s" : ""}
        {(filterCountry || filterState || filterCity) && (
          <span className="text-gray-400"> (filtered)</span>
        )}
        {" · "}
        <span className="text-gray-400">sorted by rating</span>
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
          <span className="text-4xl">🔍</span>
          <p className="text-sm text-gray-500">No saved restaurants match these filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry, i) => (
            <SavedPlaceCard
              key={entry.placeId}
              rank={i + 1}
              placeId={entry.placeId}
              name={entry.name}
              vicinity={entry.vicinity}
              city={entry.city}
              state={entry.state}
              country={entry.country}
              visits={entry.visits}
              onSaveToggle={onSaveToggle}
              onAddVisit={onAddVisit}
              onEditVisit={onEditVisit}
              onDeleteVisit={onDeleteVisit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  rank: number;
  placeId: string;
  name: string;
  vicinity: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  visits: Visit[];
  onSaveToggle?: (placeId: string, saved: boolean) => void;
  onAddVisit?: (placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onEditVisit?: (visitId: string, placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onDeleteVisit?: (visitId: string, placeId: string) => Promise<void>;
}

function SavedPlaceCard({
  rank,
  placeId,
  name,
  vicinity,
  city,
  state,
  country,
  visits,
  onSaveToggle,
  onAddVisit,
  onEditVisit,
  onDeleteVisit,
}: CardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitRating, setVisitRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [visitNote, setVisitNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState<number | null>(null);
  const [editHoverRating, setEditHoverRating] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const avg = avgRating(visits);

  const locationParts = [city, state, country].filter(Boolean).join(", ");

  const handleSubmitVisit = async () => {
    if (!onAddVisit) return;
    setIsSubmitting(true);
    try {
      await onAddVisit(placeId, visitRating, visitNote.trim());
      setVisitRating(null);
      setVisitNote("");
      setShowVisitForm(false);
      setShowHistory(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditVisit = (v: Visit) => {
    setEditingVisitId(v.id);
    setEditRating(v.rating);
    setEditNote(v.note ?? "");
    setEditHoverRating(null);
  };

  const handleEditSubmit = async () => {
    if (!onEditVisit || !editingVisitId) return;
    setIsEditSubmitting(true);
    try {
      await onEditVisit(editingVisitId, placeId, editRating, editNote.trim());
      setEditingVisitId(null);
    } finally {
      setIsEditSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl shadow-sm border bg-amber-50 border-amber-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Rank badge */}
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center mt-0.5">
            {rank}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-base leading-tight truncate">{name}</h2>
            {avg !== null && (
              <div className="flex items-center gap-1 mt-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <StarIcon
                    key={i}
                    filled={i <= Math.round(avg)}
                    className="w-3.5 h-3.5"
                  />
                ))}
                <span className="text-xs font-medium text-gray-700">{avg.toFixed(1)}</span>
                <span className="text-xs text-gray-400">
                  ({visits.filter((v) => v.rating !== null).length} rated)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Unsave button */}
        {onSaveToggle && (
          <button
            onClick={() => onSaveToggle(placeId, false)}
            title="Remove from saved"
            className="flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
          >
            <BookmarkFilledIcon />
            Saved
          </button>
        )}
      </div>

      {/* Location */}
      <div className="pl-10 space-y-1.5">
        {vicinity && (
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 text-gray-400 mt-0.5">
              <MapIcon />
            </span>
            <span className="text-sm text-gray-700">{vicinity}</span>
          </div>
        )}
        {locationParts && (
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 text-gray-400 mt-0.5">
              <GlobeIcon />
            </span>
            <span className="text-sm text-gray-600">{locationParts}</span>
          </div>
        )}
      </div>

      {/* Visit section */}
      <div className="mt-3 pt-3 border-t border-amber-100 pl-10">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {visits.length > 0 ? (
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ClockIcon />
                <span>{visits.length} visit{visits.length !== 1 ? "s" : ""}</span>
                {avg !== null && (
                  <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                    <StarIcon filled className="w-3 h-3" />
                    {avg.toFixed(1)} avg
                  </span>
                )}
                <ChevronIcon open={showHistory} />
              </button>
            ) : (
              <span className="text-xs text-gray-400 italic">No visits logged yet</span>
            )}
          </div>
          {onAddVisit && (
            <button
              onClick={() => {
                setShowVisitForm((v) => !v);
                if (showVisitForm) { setVisitRating(null); setVisitNote(""); }
              }}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <PlusIcon />
              Log Visit
            </button>
          )}
        </div>

        {/* Visit history */}
        {showHistory && visits.length > 0 && (
          <div className="space-y-2 mb-2">
            {[...visits]
              .sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime())
              .map((v) => (
                <div key={v.id} className="bg-white rounded-lg p-2.5 text-xs relative group border border-amber-100">
                  {editingVisitId === v.id ? (
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1.5">Rating (optional)</p>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setEditRating(editRating === star ? null : star)}
                              onMouseEnter={() => setEditHoverRating(star)}
                              onMouseLeave={() => setEditHoverRating(null)}
                              className="transition-transform hover:scale-110"
                              title={`${star} star${star !== 1 ? "s" : ""}`}
                            >
                              <StarIcon
                                filled={star <= (editHoverRating ?? editRating ?? 0)}
                                className="w-5 h-5 transition-colors"
                              />
                            </button>
                          ))}
                          {editRating !== null && (
                            <span className="text-xs text-gray-500 ml-1">
                              {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][editRating]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Note (optional)</p>
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="How was your visit?"
                          rows={2}
                          maxLength={500}
                          className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white placeholder-gray-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleEditSubmit}
                          disabled={isEditSubmitting}
                          className="flex-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md py-1.5 transition-colors"
                        >
                          {isEditSubmitting ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingVisitId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-gray-400">
                          {new Date(v.visitedAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          {v.rating !== null && (
                            <span className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <StarIcon
                                  key={i}
                                  filled={i < (v.rating ?? 0)}
                                  className="w-3 h-3"
                                />
                              ))}
                            </span>
                          )}
                          {onEditVisit && (
                            <button
                              onClick={() => startEditVisit(v)}
                              title="Edit visit"
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-400 transition-all"
                            >
                              <PencilIcon />
                            </button>
                          )}
                          {onDeleteVisit && (
                            <button
                              onClick={() => onDeleteVisit(v.id, placeId)}
                              title="Delete visit"
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      </div>
                      {v.note && <p className="text-gray-600 leading-relaxed">{v.note}</p>}
                      {!v.note && v.rating === null && (
                        <p className="text-gray-400 italic">No details recorded</p>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Log visit form */}
        {showVisitForm && (
          <div className="bg-blue-50 rounded-lg p-3 space-y-2.5">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Rating (optional)</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setVisitRating(visitRating === star ? null : star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="transition-transform hover:scale-110"
                    title={`${star} star${star !== 1 ? "s" : ""}`}
                  >
                    <StarIcon
                      filled={star <= (hoverRating ?? visitRating ?? 0)}
                      className="w-6 h-6 transition-colors"
                    />
                  </button>
                ))}
                {visitRating !== null && (
                  <span className="text-xs text-gray-500 ml-1">
                    {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][visitRating]}
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Note (optional)</p>
              <textarea
                value={visitNote}
                onChange={(e) => setVisitNote(e.target.value)}
                placeholder="How was your visit?"
                rows={2}
                maxLength={500}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white placeholder-gray-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmitVisit}
                disabled={isSubmitting}
                className="flex-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md py-1.5 transition-colors"
              >
                {isSubmitting ? "Saving…" : "Save Visit"}
              </button>
              <button
                onClick={() => { setShowVisitForm(false); setVisitRating(null); setVisitNote(""); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={`${className ?? "w-3.5 h-3.5"} ${filled ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`}
      viewBox="0 0 20 20"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

function BookmarkFilledIcon() {
  return (
    <svg className="w-3 h-3" fill="currentColor" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
    </svg>
  );
}
