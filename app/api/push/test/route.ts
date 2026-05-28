import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sendPushToUser } from "@/lib/push";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const delivered = await sendPushToUser(userId, {
      title: "Test notification",
      body: "Test notification",
      placeId: "test",
      url: "/",
    });
    console.log("[POST /api/push/test] sent", { userId, delivered });
    return NextResponse.json({ delivered });
  } catch (err) {
    console.error("[POST /api/push/test] sendPushToUser failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
