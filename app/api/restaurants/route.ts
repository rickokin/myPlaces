import { NextRequest, NextResponse } from "next/server";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DEFAULT_RADIUS_FT = 300;

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
  distance?: number;
}

interface PlaceDetailsResult {
  formatted_phone_number?: string;
  website?: string;
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json"
  );
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_phone_number,website");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY!);

  const res = await fetch(url.toString());
  const data = await res.json();
  return data.result ?? {};
}

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: "Google Maps API key is not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radiusFt = parseFloat(searchParams.get("radius") ?? String(DEFAULT_RADIUS_FT));
  const radiusMeters = radiusFt * 0.3048;

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  try {
    // rankby=distance returns results ordered by proximity (closest first).
    // It is mutually exclusive with the radius param, so we apply the user's
    // radius as a server-side filter after computing Haversine distances.
    const nearbyUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    );
    nearbyUrl.searchParams.set("location", `${lat},${lng}`);
    nearbyUrl.searchParams.set("rankby", "distance");
    nearbyUrl.searchParams.set("type", "restaurant");
    nearbyUrl.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const nearbyRes = await fetch(nearbyUrl.toString());
    const nearbyData = await nearbyRes.json();

    if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { error: `Places API error: ${nearbyData.status}` },
        { status: 500 }
      );
    }

    const places: PlaceResult[] = nearbyData.results ?? [];

    // Fetch details (phone + website) for each place in parallel
    const detailedPlaces = await Promise.all(
      places.map(async (place) => {
        const details = await getPlaceDetails(place.place_id);
        const distance = haversineDistance(
          parseFloat(lat),
          parseFloat(lng),
          place.geometry.location.lat,
          place.geometry.location.lng
        );
        return {
          ...place,
          formatted_phone_number: details.formatted_phone_number,
          website: details.website,
          distance,
        };
      })
    );

    // Keep only places within the requested radius, then sort closest first.
    const placesInRadius = detailedPlaces.filter(
      (p) => (p.distance ?? 0) <= radiusMeters
    );
    placesInRadius.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

    return NextResponse.json({ restaurants: placesInRadius });
  } catch (err) {
    console.error("Error fetching restaurants:", err);
    return NextResponse.json(
      { error: "Failed to fetch restaurants" },
      { status: 500 }
    );
  }
}
