import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { placeVisits, savedPlaces } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendPushToUser } from "@/lib/push";

type ReminderBody = {
  placeId?: string;
  name?: string;
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ReminderBody;
  try {
    body = (await req.json()) as ReminderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const placeId = body.placeId?.slice(0, 500);
  const name = (body.name ?? "this place").slice(0, 200);
  if (!placeId) {
    return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
  }

  // Re-verify eligibility on the server to defeat client races: only send if
  // the place is either not saved at all, or saved with zero visits.
  try {
    const saved = await db
      .select({ id: savedPlaces.id })
      .from(savedPlaces)
      .where(and(eq(savedPlaces.userId, userId), eq(savedPlaces.placeId, placeId)))
      .limit(1);

    if (saved.length > 0) {
      const visits = await db
        .select({ id: placeVisits.id })
        .from(placeVisits)
        .where(eq(placeVisits.savedPlaceId, saved[0].id))
        .limit(1);
      if (visits.length > 0) {
        return NextResponse.json({ skipped: "already_logged" });
      }
    }
  } catch (err) {
    console.error("[POST /api/dwell/reminder] eligibility check failed", {
      userId,
      placeId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Continue — better to nudge than to silently fail.
  }

  try {
    const delivered = await sendPushToUser(userId, {
      title: `Still at ${name}?`,
      body: "Tap to log your visit.",
      placeId,
      url: `/place/${encodeURIComponent(placeId)}?from=reminder`,
    });
    return NextResponse.json({ delivered });
  } catch (err) {
    console.error("[POST /api/dwell/reminder] sendPushToUser failed", {
      userId,
      placeId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
