import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  PlaceResult,
  NewPlaceApiResult,
  PLACES_FIELD_MASK,
  mapToPlaceResult,
} from "@/app/api/restaurants/route";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAX_QUERY_LENGTH = 200;

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
  const query = searchParams.get("q");

  if (!query?.trim()) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  const trimmedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: trimmedQuery,
          includedType: "restaurant",
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[search] Places API error:", JSON.stringify(data));
      return NextResponse.json(
        { error: `Places API error: ${data.error?.message ?? res.status}` },
        { status: 500 }
      );
    }

    const places: NewPlaceApiResult[] = data.places ?? [];
    const restaurants: PlaceResult[] = places.map(mapToPlaceResult);

    return NextResponse.json({ restaurants });
  } catch (err) {
    console.error("Error searching places:", err);
    return NextResponse.json(
      { error: "Failed to search places" },
      { status: 500 }
    );
  }
}
