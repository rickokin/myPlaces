import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

let configured = false;

function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    throw new Error(
      "[lib/push] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY in environment"
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type DwellPushPayload = {
  title: string;
  body: string;
  placeId: string;
  url?: string;
};

/**
 * Sends a push to every subscription registered for a user. Subscriptions
 * that the push service reports as gone (404/410) are pruned from the DB.
 * Returns the count of successful deliveries.
 */
export async function sendPushToUser(userId: string, payload: DwellPushPayload): Promise<number> {
  configure();

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        delivered++;
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone; remove it.
          await db
            .delete(pushSubscriptions)
            .where(
              and(
                eq(pushSubscriptions.userId, userId),
                eq(pushSubscriptions.endpoint, sub.endpoint)
              )
            );
        } else {
          console.error("[lib/push] sendNotification failed", { statusCode, err });
        }
      }
    })
  );

  return delivered;
}
