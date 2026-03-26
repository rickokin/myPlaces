import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAX_ADDRESS_LENGTH = 500;

function buildAddressFromComponents(result: {
  address_components?: { types: string[]; short_name: string; long_name: string }[];
  formatted_address?: string;
}): string {
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

  return address || result.formatted_address || "";
}

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
  const addressQuery = searchParams.get("address");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  // Forward geocoding: address string → lat/lng
  if (addressQuery) {
    const safeAddress = addressQuery.trim().slice(0, MAX_ADDRESS_LENGTH);
    if (!safeAddress) {
      return NextResponse.json({ error: "Address cannot be empty" }, { status: 400 });
    }
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", safeAddress);
      url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.status !== "OK" || !data.results?.length) {
        return NextResponse.json(
          { error: "Address not found" },
          { status: 404 }
        );
      }

      const result = data.results[0];
      const { lat: resLat, lng: resLng } = result.geometry.location;
      const address = buildAddressFromComponents(result);

      return NextResponse.json({ lat: resLat, lng: resLng, address });
    } catch (err) {
      console.error("Error forward geocoding:", err);
      return NextResponse.json(
        { error: "Failed to geocode address" },
        { status: 500 }
      );
    }
  }

  // Reverse geocoding: lat/lng → address string
  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Either 'address' or both 'lat' and 'lng' query parameters are required" },
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

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latNum},${lngNum}`);
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({ address: null });
    }

    const result = data.results[0];
    const address = buildAddressFromComponents(result);

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
