import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { sendPushToUser } from "@/lib/push";

type ReminderBody = {
  lat?: number;
  lng?: number;
};

// Best-effort in-memory cooldown to suppress rapid duplicate triggers from a
// single instance (e.g., several tabs / quick reloads). Not authoritative
// across deployment instances, but cheap insurance on top of the client
// dedupe logic.
const COOLDOWN_MS = 5 * 60 * 1000;
const lastSentByUser = new Map<string, number>();

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

  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;

  const now = Date.now();
  const last = lastSentByUser.get(userId) ?? 0;
  if (now - last < COOLDOWN_MS) {
    return NextResponse.json({ skipped: "cooldown" });
  }
  lastSentByUser.set(userId, now);

  const url =
    lat !== null && lng !== null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : "/";

  try {
    const delivered = await sendPushToUser(userId, {
      title: "Still in the same spot?",
      body: `You've been stationary for 10 minutes.`,
      placeId: "stationary",
      url,
    });
    return NextResponse.json({ delivered });
  } catch (err) {
    console.error("[POST /api/stationary/reminder] sendPushToUser failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
