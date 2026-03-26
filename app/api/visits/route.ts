import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { savedPlaces, placeVisits } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { placeId, rating, note } = body as {
    placeId?: string;
    rating?: number | null;
    note?: string | null;
  };

  if (!placeId) {
    return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
  }

  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
    return NextResponse.json({ error: "Rating must be an integer between 1 and 5" }, { status: 400 });
  }

  const [savedPlace] = await db
    .select({ id: savedPlaces.id })
    .from(savedPlaces)
    .where(and(eq(savedPlaces.userId, userId), eq(savedPlaces.placeId, placeId)));

  if (!savedPlace) {
    return NextResponse.json({ error: "Place not saved" }, { status: 404 });
  }

  const [visit] = await db
    .insert(placeVisits)
    .values({
      savedPlaceId: savedPlace.id,
      rating: rating ?? null,
      note: note ?? null,
    })
    .returning();

  return NextResponse.json({
    visit: {
      id: visit.id,
      rating: visit.rating,
      note: visit.note,
      visitedAt: visit.visitedAt.toISOString(),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { visitId, rating, note } = body as {
    visitId?: string;
    rating?: number | null;
    note?: string | null;
  };

  if (!visitId) {
    return NextResponse.json({ error: "Missing visitId" }, { status: 400 });
  }

  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
    return NextResponse.json({ error: "Rating must be an integer between 1 and 5" }, { status: 400 });
  }

  const [owned] = await db
    .select({ id: placeVisits.id })
    .from(placeVisits)
    .innerJoin(savedPlaces, eq(placeVisits.savedPlaceId, savedPlaces.id))
    .where(and(eq(placeVisits.id, visitId), eq(savedPlaces.userId, userId)));

  if (!owned) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const [visit] = await db
    .update(placeVisits)
    .set({ rating: rating ?? null, note: note ?? null })
    .where(eq(placeVisits.id, visitId))
    .returning();

  return NextResponse.json({
    visit: {
      id: visit.id,
      rating: visit.rating,
      note: visit.note,
      visitedAt: visit.visitedAt.toISOString(),
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const visitId = searchParams.get("visitId");

  if (!visitId) {
    return NextResponse.json({ error: "Missing visitId" }, { status: 400 });
  }

  // Verify ownership via join before deleting
  const [owned] = await db
    .select({ id: placeVisits.id })
    .from(placeVisits)
    .innerJoin(savedPlaces, eq(placeVisits.savedPlaceId, savedPlaces.id))
    .where(and(eq(placeVisits.id, visitId), eq(savedPlaces.userId, userId)));

  if (!owned) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  await db.delete(placeVisits).where(eq(placeVisits.id, visitId));

  return NextResponse.json({ success: true });
}
