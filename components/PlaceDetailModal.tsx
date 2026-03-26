"use client";

import { useEffect } from "react";
import { PlaceResult } from "@/app/api/restaurants/route";

interface Props {
  place: PlaceResult;
  onClose: () => void;
}

const GENERIC_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "food",
  "store",
  "premise",
  "geocode",
]);

const PRICE_LABELS: Record<number, string> = {
  0: "Free",
  1: "Inexpensive",
  2: "Moderate",
  3: "Expensive",
  4: "Very Expensive",
};

function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PriceLevel({ level }: { level: number }) {
  const dollars = "$".repeat(Math.max(1, level));
  const ghost = "$".repeat(Math.max(0, 4 - level));
  return (
    <span className="font-semibold">
      <span className="text-green-600">{dollars}</span>
      <span className="text-gray-300">{ghost}</span>
      <span className="ml-2 text-sm font-normal text-gray-500">{PRICE_LABELS[level]}</span>
    </span>
  );
}

function StarRow({ rating, count }: { rating: number; count?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < full;
          const isHalf = !filled && i === full && half;
          return (
            <svg key={i} className="w-5 h-5" viewBox="0 0 20 20">
              {isHalf ? (
                <>
                  <defs>
                    <linearGradient id={`half-${i}`} x1="0" x2="1" y1="0" y2="0">
                      <stop offset="50%" stopColor="#fbbf24" />
                      <stop offset="50%" stopColor="#e5e7eb" />
                    </linearGradient>
                  </defs>
                  <path
                    fill={`url(#half-${i})`}
                    d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                  />
                </>
              ) : (
                <path
                  fill={filled ? "#fbbf24" : "#e5e7eb"}
                  d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                />
              )}
            </svg>
          );
        })}
      </div>
      <span className="text-lg font-bold text-gray-800">{rating.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-sm text-gray-400">({count.toLocaleString()} reviews)</span>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

export default function PlaceDetailModal({ place, onClose }: Props) {
  const {
    name,
    rating,
    user_ratings_total,
    types,
    editorial_summary,
    generative_summary,
    price_level,
  } = place;

  const visibleTypes = types?.filter((t) => !GENERIC_TYPES.has(t)) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const hasContent =
    rating !== undefined ||
    (visibleTypes.length > 0) ||
    editorial_summary?.overview ||
    generative_summary?.overview?.text ||
    price_level !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 leading-snug pr-2">{name}</h2>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-5 space-y-5">
          {!hasContent && (
            <p className="text-sm text-gray-400 italic text-center py-4">
              No additional details available for this place.
            </p>
          )}

          {/* Rating */}
          {rating !== undefined && (
            <Section label="Google Rating">
              <StarRow rating={rating} count={user_ratings_total} />
            </Section>
          )}

          {/* Price level */}
          {price_level !== undefined && (
            <Section label="Price Level">
              <PriceLevel level={price_level} />
            </Section>
          )}

          {/* Types */}
          {visibleTypes.length > 0 && (
            <Section label="Categories">
              <div className="flex flex-wrap gap-1.5">
                {visibleTypes.map((t) => (
                  <span
                    key={t}
                    className="text-xs font-medium px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full"
                  >
                    {formatType(t)}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Editorial summary */}
          {editorial_summary?.overview && (
            <Section label="Editorial Summary">
              <p className="text-sm text-gray-700 leading-relaxed">{editorial_summary.overview}</p>
            </Section>
          )}

          {/* Generative summary */}
          {generative_summary?.overview?.text && (
            <Section label="AI Summary">
              <p className="text-sm text-gray-700 leading-relaxed">{generative_summary.overview.text}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
