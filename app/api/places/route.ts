import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { savedPlaces, placeVisits } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { placeId, name, vicinity, city, state, country } = body as {
    placeId?: string;
    name?: string;
    vicinity?: string;
    city?: string;
    state?: string;
    country?: string;
  };

  if (!placeId || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await db
    .insert(savedPlaces)
    .values({ userId, placeId, name, vicinity, city, state, country })
    .onConflictDoNothing();

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");

  if (!placeId) {
    return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
  }

  await db
    .delete(savedPlaces)
    .where(and(eq(savedPlaces.userId, userId), eq(savedPlaces.placeId, placeId)));

  return NextResponse.json({ success: true });
}
