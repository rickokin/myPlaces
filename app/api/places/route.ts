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
      visitId: placeVisits.id,
      rating: placeVisits.rating,
      note: placeVisits.note,
      visitedAt: placeVisits.visitedAt,
    })
    .from(savedPlaces)
    .leftJoin(placeVisits, eq(placeVisits.savedPlaceId, savedPlaces.id))
    .where(eq(savedPlaces.userId, userId));

  const placesMap = new Map<string, { name: string; visits: { id: string; rating: number | null; note: string | null; visitedAt: string }[] }>();
  for (const row of rows) {
    if (!placesMap.has(row.placeId)) {
      placesMap.set(row.placeId, { name: row.name, visits: [] });
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
  const { placeId, name, vicinity } = body as {
    placeId?: string;
    name?: string;
    vicinity?: string;
  };

  if (!placeId || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await db
    .insert(savedPlaces)
    .values({ userId, placeId, name, vicinity })
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
