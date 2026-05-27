import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { savedPlaces, placeVisits } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const LIMITS = {
  placeId: 500,
  name: 200,
  vicinity: 300,
  city: 100,
  state: 100,
  country: 100,
} as const;

function truncate(value: string | undefined, max: number): string | undefined {
  return value ? value.slice(0, max) : value;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    console.warn("[GET /api/places] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rows;
  try {
    rows = await db
      .select({
        placeId: savedPlaces.placeId,
        name: savedPlaces.name,
        vicinity: savedPlaces.vicinity,
        city: savedPlaces.city,
        state: savedPlaces.state,
        country: savedPlaces.country,
        visitId: placeVisits.id,
        rating: placeVisits.rating,
        note: placeVisits.note,
        visitedAt: placeVisits.visitedAt,
      })
      .from(savedPlaces)
      .leftJoin(placeVisits, eq(placeVisits.savedPlaceId, savedPlaces.id))
      .where(eq(savedPlaces.userId, userId));
  } catch (err) {
    console.error("[GET /api/places] Database error", {
      userId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Failed to load saved places" }, { status: 500 });
  }

  const placesMap = new Map<string, {
    name: string;
    vicinity: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    visits: { id: string; rating: number | null; note: string | null; visitedAt: string | null }[];
  }>();
  for (const row of rows) {
    if (!placesMap.has(row.placeId)) {
      placesMap.set(row.placeId, { name: row.name, vicinity: row.vicinity, city: row.city, state: row.state, country: row.country, visits: [] });
    }
    if (row.visitId) {
      placesMap.get(row.placeId)!.visits.push({
        id: row.visitId,
        rating: row.rating,
        note: row.note,
        visitedAt: row.visitedAt?.toISOString() ?? null,
      });
    }
  }

  const result = Array.from(placesMap.entries()).map(([placeId, data]) => ({
    placeId,
    name: data.name,
    vicinity: data.vicinity,
    city: data.city,
    state: data.state,
    country: data.country,
    visits: data.visits,
  }));

  return NextResponse.json({ savedPlaces: result });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    console.warn("[POST /api/places] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.warn("[POST /api/places] Invalid JSON body", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { placeId, name, vicinity, city, state, country } = body as {
    placeId?: string;
    name?: string;
    vicinity?: string;
    city?: string;
    state?: string;
    country?: string;
  };

  if (!placeId || !name) {
    console.warn("[POST /api/places] Missing required fields", { userId, placeId, hasName: !!name });
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (typeof placeId !== "string" || typeof name !== "string") {
    console.warn("[POST /api/places] Invalid field types", { userId });
    return NextResponse.json({ error: "Invalid field types" }, { status: 400 });
  }

  try {
    const user = await currentUser();
    const userEmail = user?.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    )?.emailAddress ?? null;

    await db
      .insert(savedPlaces)
      .values({
        userId,
        userEmail,
        placeId: placeId.slice(0, LIMITS.placeId),
        name: name.slice(0, LIMITS.name),
        vicinity: truncate(vicinity, LIMITS.vicinity),
        city: truncate(city, LIMITS.city),
        state: truncate(state, LIMITS.state),
        country: truncate(country, LIMITS.country),
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/places] Database error", {
      userId,
      placeId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Failed to save place" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    console.warn("[DELETE /api/places] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");

  if (!placeId) {
    console.warn("[DELETE /api/places] Missing placeId", { userId });
    return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
  }

  try {
    const deleted = await db
      .delete(savedPlaces)
      .where(and(eq(savedPlaces.userId, userId), eq(savedPlaces.placeId, placeId)))
      .returning({ id: savedPlaces.id });

    if (deleted.length === 0) {
      console.warn("[DELETE /api/places] No matching saved place found", { userId, placeId });
    } else {
      console.log("[DELETE /api/places] Deleted saved place", {
        userId,
        placeId,
        deletedCount: deleted.length,
      });
    }

    return NextResponse.json({ success: true, deletedCount: deleted.length });
  } catch (err) {
    console.error("[DELETE /api/places] Database error", {
      userId,
      placeId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Failed to delete saved place" }, { status: 500 });
  }
}
