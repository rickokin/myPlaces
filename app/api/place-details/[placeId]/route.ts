import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  PlaceResult,
  NewPlaceApiResult,
  mapToPlaceResult,
} from "@/app/api/restaurants/route";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface PlaceReview {
  rating?: number;
  text?: string;
  relativeTime?: string;
  publishTime?: string;
  authorName?: string;
  authorPhotoUri?: string;
}

export interface PlaceDetails extends PlaceResult {
  reviews?: PlaceReview[];
  weekdayDescriptions?: string[];
}

// Google Places (New) review object — only the fields we consume.
interface NewPlaceReview {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  relativePublishTimeDescription?: string;
  publishTime?: string;
  authorAttribution?: {
    displayName?: string;
    photoUri?: string;
  };
}

interface PlaceDetailsApiResult extends NewPlaceApiResult {
  reviews?: NewPlaceReview[];
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

const FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "currentOpeningHours",
  "regularOpeningHours.weekdayDescriptions",
  "types",
  "priceLevel",
  "nationalPhoneNumber",
  "websiteUri",
  "editorialSummary",
  "generativeSummary",
  "addressComponents",
  "reviews",
].join(",");

function mapReview(r: NewPlaceReview): PlaceReview {
  return {
    rating: r.rating,
    text: r.text?.text ?? r.originalText?.text,
    relativeTime: r.relativePublishTimeDescription,
    publishTime: r.publishTime,
    authorName: r.authorAttribution?.displayName,
    authorPhotoUri: r.authorAttribution?.photoUri,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ placeId: string }> }
) {
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

  const { placeId } = await params;
  if (!placeId || typeof placeId !== "string") {
    return NextResponse.json(
      { error: "placeId is required" },
      { status: 400 }
    );
  }

  // Google Place IDs are URL-safe but include characters like ':' that
  // Next normalizes; encode defensively so the upstream path is well-formed.
  const safeId = encodeURIComponent(placeId);

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${safeId}`,
      {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": FIELD_MASK,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[place-details] Places API error:", JSON.stringify(data));
      const status = res.status === 404 ? 404 : 500;
      return NextResponse.json(
        { error: `Places API error: ${data.error?.message ?? res.status}` },
        { status }
      );
    }

    const place = data as PlaceDetailsApiResult;
    const base = mapToPlaceResult(place);
    const details: PlaceDetails = {
      ...base,
      reviews: place.reviews?.map(mapReview),
      weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions,
    };

    return NextResponse.json({ place: details });
  } catch (err) {
    console.error("Error fetching place details:", err);
    return NextResponse.json(
      { error: "Failed to fetch place details" },
      { status: 500 }
    );
  }
}
