import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DEFAULT_RADIUS_FT = 300;
const MAX_RADIUS_FT = 52_800; // 10 miles

// ─── Shared PlaceResult type (imported by other routes and UI components) ───

export interface PlaceResult {
  place_id: string;
  name: string;
  vicinity: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    open_now?: boolean;
  };
  types?: string[];
  price_level?: number;
  editorial_summary?: { overview?: string };
  generative_summary?: { overview?: { text: string; languageCode?: string } };
  distance?: number;
  city?: string;
  state?: string;
  country?: string;
}

// ─── Places API (New) response shape ────────────────────────────────────────

export interface NewPlaceApiResult {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  types?: string[];
  priceLevel?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  editorialSummary?: { text?: string; languageCode?: string };
  generativeSummary?: { overview?: { text: string; languageCode?: string } };
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
  }>;
}

// ─── Shared constants / helpers (also used by /api/search) ──────────────────

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours",
  "places.types",
  "places.priceLevel",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.editorialSummary",
  "places.generativeSummary",
  "places.addressComponents",
].join(",");

function parseLocation(
  components: NewPlaceApiResult["addressComponents"]
): { city?: string; state?: string; country?: string } {
  if (!components) return {};
  const get = (type: string, key: "longText" | "shortText" = "longText") =>
    components.find((c) => c.types.includes(type))?.[key];
  return {
    city: get("locality") || get("postal_town") || get("sublocality_level_1"),
    state: get("administrative_area_level_1"),
    country: get("country"),
  };
}

export function mapToPlaceResult(
  place: NewPlaceApiResult
): Omit<PlaceResult, "distance"> {
  return {
    place_id: place.id,
    name: place.displayName?.text ?? "",
    vicinity: place.formattedAddress ?? "",
    geometry: {
      location: {
        lat: place.location?.latitude ?? 0,
        lng: place.location?.longitude ?? 0,
      },
    },
    rating: place.rating,
    user_ratings_total: place.userRatingCount,
    opening_hours: place.currentOpeningHours
      ? { open_now: place.currentOpeningHours.openNow }
      : undefined,
    types: place.types,
    price_level:
      place.priceLevel !== undefined
        ? PRICE_LEVEL_MAP[place.priceLevel]
        : undefined,
    formatted_phone_number: place.nationalPhoneNumber,
    website: place.websiteUri,
    editorial_summary: place.editorialSummary?.text
      ? { overview: place.editorialSummary.text }
      : undefined,
    generative_summary: place.generativeSummary,
    ...parseLocation(place.addressComponents),
  };
}

// ─── Haversine distance (meters) ────────────────────────────────────────────

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: "Google Maps API key is not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  if (
    !isFinite(latNum) || !isFinite(lngNum) ||
    latNum < -90 || latNum > 90 ||
    lngNum < -180 || lngNum > 180
  ) {
    return NextResponse.json(
      { error: "Invalid lat or lng values" },
      { status: 400 }
    );
  }

  const rawRadius = parseFloat(searchParams.get("radius") ?? String(DEFAULT_RADIUS_FT));
  const radiusFt = isFinite(rawRadius) && rawRadius > 0
    ? Math.min(rawRadius, MAX_RADIUS_FT)
    : DEFAULT_RADIUS_FT;
  const radiusMeters = radiusFt * 0.3048;

  try {
    // Use a generous search radius so the API returns enough candidates;
    // we then filter to the user's exact radius via Haversine.
    const searchRadiusMeters = Math.max(radiusMeters * 10, 2000);

    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
        body: JSON.stringify({
          includedTypes: ["restaurant"],
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: {
                latitude: latNum,
                longitude: lngNum,
              },
              radius: searchRadiusMeters,
            },
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[restaurants] Places API error:", JSON.stringify(data));
      return NextResponse.json(
        { error: `Places API error: ${data.error?.message ?? res.status}` },
        { status: 500 }
      );
    }

    const places: NewPlaceApiResult[] = data.places ?? [];

    const detailedPlaces: PlaceResult[] = places.map((place) => {
      const base = mapToPlaceResult(place);
      const distance = haversineDistance(
        latNum,
        lngNum,
        base.geometry.location.lat,
        base.geometry.location.lng
      );
      return { ...base, distance };
    });

    const placesInRadius = detailedPlaces
      .filter((p) => (p.distance ?? 0) <= radiusMeters)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

    return NextResponse.json({ restaurants: placesInRadius });
  } catch (err) {
    console.error("Error fetching restaurants:", err);
    return NextResponse.json(
      { error: "Failed to fetch restaurants" },
      { status: 500 }
    );
  }
}
