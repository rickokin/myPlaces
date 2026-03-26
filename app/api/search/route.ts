import { NextRequest, NextResponse } from "next/server";
import { PlaceResult } from "@/app/api/restaurants/route";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface AddressComponent {
  types: string[];
  short_name: string;
  long_name: string;
}

interface TextSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
  };
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: { open_now?: boolean };
}

function parseLocation(components: AddressComponent[]): { city?: string; state?: string; country?: string } {
  const get = (type: string, nameKey: "short_name" | "long_name" = "long_name") =>
    components.find((c) => c.types.includes(type))?.[nameKey];
  return {
    city: get("locality") || get("postal_town") || get("sublocality_level_1"),
    state: get("administrative_area_level_1"),
    country: get("country"),
  };
}

async function getPlaceDetails(placeId: string): Promise<{
  formatted_phone_number?: string;
  website?: string;
  address_components?: AddressComponent[];
}> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_phone_number,website,address_components");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY!);
  const res = await fetch(url.toString());
  const data = await res.json();
  return data.result ?? {};
}

export async function GET(request: NextRequest) {
  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Google Maps API key is not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  try {
    const textSearchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    textSearchUrl.searchParams.set("query", query);
    textSearchUrl.searchParams.set("type", "restaurant");
    textSearchUrl.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const res = await fetch(textSearchUrl.toString());
    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json({ error: `Places API error: ${data.status}` }, { status: 500 });
    }

    const places: TextSearchResult[] = data.results ?? [];

    const detailed = await Promise.all(
      places.map(async (place) => {
        const details = await getPlaceDetails(place.place_id);
        const location = details.address_components ? parseLocation(details.address_components) : {};
        const result: PlaceResult = {
          place_id: place.place_id,
          name: place.name,
          vicinity: place.formatted_address,
          geometry: place.geometry,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          opening_hours: place.opening_hours,
          formatted_phone_number: details.formatted_phone_number,
          website: details.website,
          ...location,
        };
        return result;
      })
    );

    return NextResponse.json({ restaurants: detailed });
  } catch (err) {
    console.error("Error searching places:", err);
    return NextResponse.json({ error: "Failed to search places" }, { status: 500 });
  }
}
