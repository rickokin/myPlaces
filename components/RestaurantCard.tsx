"use client";

import { useState } from "react";
import { PlaceResult } from "@/app/api/restaurants/route";
import { Visit } from "@/types";

interface Props {
  restaurant: PlaceResult;
  rank: number;
  distanceFt?: number;
  isSaved?: boolean;
  isSignedIn?: boolean;
  visits?: Visit[];
  onSaveToggle?: (placeId: string, saved: boolean) => void;
  onAddVisit?: (placeId: string, rating: number | null, note: string) => Promise<Visit>;
  onDeleteVisit?: (visitId: string, placeId: string) => Promise<void>;
}

export default function RestaurantCard({
  restaurant,
  rank,
  distanceFt = undefined,
  isSaved = false,
  isSignedIn = false,
  visits = [],
  onSaveToggle,
  onAddVisit,
  onDeleteVisit,
}: Props) {
  const { name, vicinity, formatted_phone_number, website, rating, user_ratings_total, opening_hours } = restaurant;

  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [visitRating, setVisitRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [visitNote, setVisitNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedDistance =
    distanceFt === undefined
      ? null
      : distanceFt < 1000
        ? `${Math.round(distanceFt)} ft`
        : `${(distanceFt / 5280).toFixed(2)} mi`;

  const isOpen = opening_hours?.open_now;

  const avgRating =
    visits.length > 0
      ? visits.filter((v) => v.rating !== null).reduce((sum, v) => sum + (v.rating ?? 0), 0) /
        visits.filter((v) => v.rating !== null).length
      : null;

  const handleSubmitVisit = async () => {
    if (!onAddVisit) return;
    setIsSubmitting(true);
    try {
      await onAddVisit(restaurant.place_id, visitRating, visitNote.trim());
      setVisitRating(null);
      setVisitNote("");
      setShowVisitForm(false);
      setShowHistory(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!onDeleteVisit) return;
    await onDeleteVisit(visitId, restaurant.place_id);
  };

  return (
    <div
      className={`rounded-2xl shadow-sm border p-4 hover:shadow-md transition-shadow ${
        isSaved
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-gray-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Rank badge */}
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
            {rank}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-base leading-tight truncate">
              {name}
            </h2>
            {/* Google rating */}
            {rating && (
              <div className="flex items-center gap-1 mt-0.5">
                <StarIconFilled className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span className="text-xs font-medium text-gray-700">{rating.toFixed(1)}</span>
                {user_ratings_total && (
                  <span className="text-xs text-gray-400">({user_ratings_total.toLocaleString()})</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Distance + open/closed + save */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {formattedDistance !== null && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              <PinIcon />
              {formattedDistance}
            </span>
          )}
          {opening_hours !== undefined && (
            <span
              className={`text-xs font-medium ${
                isOpen ? "text-green-600" : "text-red-500"
              }`}
            >
              {isOpen ? "Open now" : "Closed"}
            </span>
          )}
          {isSignedIn && onSaveToggle && (
            <button
              onClick={() => onSaveToggle(restaurant.place_id, !isSaved)}
              title={isSaved ? "Remove from saved" : "Save this place"}
              className={`mt-0.5 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                isSaved
                  ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              }`}
            >
              <BookmarkIcon filled={isSaved} />
              {isSaved ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 pl-10">
        {/* Address */}
        <DetailRow icon={<MapIcon />} label="Address">
          <span className="text-gray-700 text-sm">{vicinity}</span>
        </DetailRow>

        {/* Phone */}
        {formatted_phone_number ? (
          <DetailRow icon={<PhoneIcon />} label="Phone">
            <a
              href={`tel:${formatted_phone_number.replace(/\D/g, "")}`}
              className="text-blue-600 text-sm hover:underline"
            >
              {formatted_phone_number}
            </a>
          </DetailRow>
        ) : (
          <DetailRow icon={<PhoneIcon />} label="Phone">
            <span className="text-gray-400 text-sm italic">Not available</span>
          </DetailRow>
        )}

        {/* Website */}
        {website ? (
          <DetailRow icon={<GlobeIcon />} label="Website">
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 text-sm hover:underline truncate max-w-[200px] inline-block"
            >
              {website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
            </a>
          </DetailRow>
        ) : (
          <DetailRow icon={<GlobeIcon />} label="Website">
            <span className="text-gray-400 text-sm italic">Not available</span>
          </DetailRow>
        )}
      </div>

      {/* Visit section — only for saved places when signed in */}
      {isSignedIn && isSaved && (
        <div className="mt-3 pt-3 border-t border-gray-100 pl-10">
          {/* Summary row */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {visits.length > 0 ? (
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ClockIcon />
                  <span>
                    {visits.length} visit{visits.length !== 1 ? "s" : ""}
                  </span>
                  {avgRating !== null && (
                    <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                      <StarIconFilled className="w-3 h-3 fill-amber-400" />
                      {avgRating.toFixed(1)} avg
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
                  if (showVisitForm) {
                    setVisitRating(null);
                    setVisitNote("");
                  }
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
                  <div key={v.id} className="bg-gray-50 rounded-lg p-2.5 text-xs relative group">
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
                          <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <StarIconFilled
                                key={i}
                                className={`w-3 h-3 ${i < (v.rating ?? 0) ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`}
                              />
                            ))}
                          </span>
                        )}
                        {onDeleteVisit && (
                          <button
                            onClick={() => handleDeleteVisit(v.id)}
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
                  </div>
                ))}
            </div>
          )}

          {/* Log visit form */}
          {showVisitForm && (
            <div className="bg-blue-50 rounded-lg p-3 space-y-2.5">
              {/* Star rating picker */}
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
                      <StarIconFilled
                        className={`w-6 h-6 transition-colors ${
                          star <= (hoverRating ?? visitRating ?? 0)
                            ? "fill-amber-400 text-amber-400"
                            : "fill-gray-200 text-gray-200"
                        }`}
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

              {/* Note */}
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
                  onClick={() => {
                    setShowVisitForm(false);
                    setVisitRating(null);
                    setVisitNote("");
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex-shrink-0 text-gray-400 mt-0.5" aria-label={label}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function StarIconFilled({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-3.5 h-3.5"} viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
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

function PhoneIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
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

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="w-3 h-3"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
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
