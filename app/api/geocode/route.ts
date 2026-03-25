import { NextRequest, NextResponse } from "next/server";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

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

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({ address: null });
    }

    // Pick the most specific result — typically the first one
    const result = data.results[0];

    // Pull out street number + route for a short street address
    const components: { types: string[]; short_name: string; long_name: string }[] =
      result.address_components ?? [];

    const get = (type: string, nameKey: "short_name" | "long_name" = "short_name") =>
      components.find((c) => c.types.includes(type))?.[nameKey] ?? "";

    const streetNumber = get("street_number");
    const route = get("route", "long_name");
    const neighborhood = get("neighborhood", "long_name");
    const locality = get("locality", "long_name");
    const adminArea = get("administrative_area_level_1");

    const street = [streetNumber, route].filter(Boolean).join(" ");
    const city = locality || neighborhood;
    const address = [street, city, adminArea].filter(Boolean).join(", ");

    return NextResponse.json({
      address: address || result.formatted_address,
      formatted_address: result.formatted_address,
    });
  } catch (err) {
    console.error("Error reverse geocoding:", err);
    return NextResponse.json(
      { error: "Failed to reverse geocode location" },
      { status: 500 }
    );
  }
}
