"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import type { PlaceDetails, PlaceReview } from "@/app/api/place-details/[placeId]/route";

const BACK_LINKS: Record<string, { href: string; label: string }> = {
  nearby: { href: "/?tab=nearby", label: "Back to Nearby" },
  been: { href: "/?tab=been", label: "Back to Been" },
  potential: { href: "/?tab=potential", label: "Back to Potential" },
  search: { href: "/?tab=search", label: "Back to Search" },
  "place-search": { href: "/?tab=place-search", label: "Back to Place Search" },
  reminder: { href: "/?tab=nearby", label: "Back to Nearby" },
};

const DEFAULT_BACK_LINK = BACK_LINKS["nearby"];

type Status = "loading" | "success" | "error" | "unauthorized";

const PRICE_LABELS: Record<number, string> = {
  0: "Free",
  1: "Inexpensive",
  2: "Moderate",
  3: "Expensive",
  4: "Very Expensive",
};

const GENERIC_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "food",
  "store",
  "premise",
  "geocode",
]);

function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PlaceDetailClient({ placeId }: { placeId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const backLink = BACK_LINKS[from] ?? DEFAULT_BACK_LINK;
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("unauthorized");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const res = await fetch(
          `/api/place-details/${encodeURIComponent(placeId)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load place details");
        }
        setPlace(data.place as PlaceDetails);
        setStatus("success");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Failed to load place details");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, placeId]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={backLink.href}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            <BackIcon />
            {backLink.label}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xl">🍽️</span>
            <span className="text-sm font-semibold text-gray-700">Place details</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {from === "reminder" && status === "success" && place && (
          <ReminderBanner placeId={placeId} place={place} />
        )}

        {status === "loading" && (
          <StatusBlock icon="⏳" title="Loading place details…" subtitle="Fetching reviews and info" pulse />
        )}

        {status === "unauthorized" && (
          <StatusBlock
            icon="🔒"
            title="Sign in to view place details"
            subtitle="Please sign in from the home page to see reviews and details for this place."
          />
        )}

        {status === "error" && (
          <StatusBlock
            icon="⚠️"
            title="Couldn't load place details"
            subtitle={errorMessage}
          />
        )}

        {status === "success" && place && <PlaceContent place={place} />}
      </main>
    </div>
  );
}

function ReminderBanner({
  placeId,
  place,
}: {
  placeId: string;
  place: PlaceDetails;
}) {
  const [phase, setPhase] = useState<"prompt" | "saving" | "saved" | "error">("prompt");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setPhase("saving");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          name: place.name,
          vicinity: place.vicinity,
          city: place.city,
          state: place.state,
          country: place.country,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setPhase("saved");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save place");
      setPhase("error");
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden>🔔</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Still at {place.name}?
          </p>
          <p className="text-xs text-amber-800/80 mt-0.5">
            You&apos;ve been here a while. Save it and log your visit.
          </p>

          {phase === "prompt" && (
            <button
              onClick={handleSave}
              className="mt-3 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md px-3 py-1.5 transition-colors"
            >
              Save this place
            </button>
          )}

          {phase === "saving" && (
            <p className="mt-3 text-xs font-medium text-amber-800">Saving…</p>
          )}

          {phase === "saved" && (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-xs font-medium text-green-700 inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved to Potential
              </span>
              <Link
                href="/?tab=potential"
                className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors inline-block"
              >
                Open Potential to add rating & note
              </Link>
            </div>
          )}

          {phase === "error" && (
            <div className="mt-3 flex items-center gap-3">
              <p className="text-xs text-red-600">{errorMessage}</p>
              <button
                onClick={handleSave}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaceContent({ place }: { place: PlaceDetails }) {
  const {
    name,
    vicinity,
    formatted_phone_number,
    website,
    rating,
    user_ratings_total,
    types,
    price_level,
    editorial_summary,
    generative_summary,
    weekdayDescriptions,
    opening_hours,
    reviews,
  } = place;

  const visibleTypes = types?.filter((t) => !GENERIC_TYPES.has(t)) ?? [];
  const isOpen = opening_hours?.open_now;

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{name}</h1>
        {vicinity && (
          <p className="text-sm text-gray-600 mt-1 flex items-start gap-1.5">
            <MapPinIcon />
            <span>{vicinity}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
          {rating !== undefined && (
            <div className="flex items-center gap-2">
              <Stars rating={rating} />
              <span className="text-base font-bold text-gray-800">{rating.toFixed(1)}</span>
              {user_ratings_total !== undefined && (
                <span className="text-xs text-gray-500">
                  ({user_ratings_total.toLocaleString()} reviews)
                </span>
              )}
            </div>
          )}
          {price_level !== undefined && (
            <PriceLevel level={price_level} />
          )}
          {opening_hours !== undefined && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isOpen ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}
            >
              {isOpen ? "Open now" : "Closed"}
            </span>
          )}
        </div>

        {(formatted_phone_number || website) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-4 border-t border-gray-100">
            {formatted_phone_number && (
              <a
                href={`tel:${formatted_phone_number.replace(/\D/g, "")}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <PhoneIcon />
                {formatted_phone_number}
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <GlobeIcon />
                {website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Categories */}
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

      {/* Hours */}
      {weekdayDescriptions && weekdayDescriptions.length > 0 && (
        <Section label="Hours">
          <ul className="text-sm text-gray-700 space-y-1">
            {weekdayDescriptions.map((d) => (
              <li key={d} className="font-mono text-xs sm:text-sm">{d}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Summaries */}
      {editorial_summary?.overview && (
        <Section label="Editorial Summary">
          <p className="text-sm text-gray-700 leading-relaxed">{editorial_summary.overview}</p>
        </Section>
      )}
      {generative_summary?.overview?.text && (
        <Section label="AI Summary">
          <p className="text-sm text-gray-700 leading-relaxed">{generative_summary.overview.text}</p>
        </Section>
      )}

      {/* Reviews */}
      <Section
        label={`Reviews${reviews?.length ? ` (${reviews.length})` : ""}`}
      >
        {!reviews || reviews.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No reviews available.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review, i) => (
              <ReviewCard key={i} review={review} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function ReviewCard({ review }: { review: PlaceReview }) {
  const { rating, text, relativeTime, authorName } = review;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-gray-800 truncate">
          {authorName ?? "Anonymous"}
        </p>
        {relativeTime && (
          <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime}</span>
        )}
      </div>
      {rating !== undefined && (
        <div className="flex items-center gap-0.5 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <StarSvg key={i} filled={i < rating} className="w-4 h-4" />
          ))}
        </div>
      )}
      {text && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
          {text}
        </p>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        if (i < full) return <StarSvg key={i} filled className="w-4 h-4" />;
        if (i === full && half) return <StarSvg key={i} half className="w-4 h-4" />;
        return <StarSvg key={i} className="w-4 h-4" />;
      })}
    </div>
  );
}

function StarSvg({
  filled = false,
  half = false,
  className = "w-4 h-4",
}: {
  filled?: boolean;
  half?: boolean;
  className?: string;
}) {
  const reactId = useId();
  if (half) {
    const id = `star-half-${reactId.replace(/[:]/g, "-")}`;
    return (
      <svg className={className} viewBox="0 0 20 20">
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#e5e7eb" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${id})`}
          d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 20 20">
      <path
        fill={filled ? "#fbbf24" : "#e5e7eb"}
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
      />
    </svg>
  );
}

function PriceLevel({ level }: { level: number }) {
  const dollars = "$".repeat(Math.max(1, level));
  const ghost = "$".repeat(Math.max(0, 4 - level));
  return (
    <span className="text-sm font-semibold inline-flex items-baseline gap-1.5">
      <span>
        <span className="text-green-600">{dollars}</span>
        <span className="text-gray-300">{ghost}</span>
      </span>
      <span className="text-xs font-normal text-gray-500">{PRICE_LABELS[level]}</span>
    </span>
  );
}

function StatusBlock({
  icon,
  title,
  subtitle,
  pulse = false,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <span className={`text-5xl ${pulse ? "animate-pulse" : ""}`}>{icon}</span>
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 max-w-xs">{subtitle}</p>}
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
