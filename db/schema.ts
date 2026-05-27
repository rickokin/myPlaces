import { pgTable, text, timestamp, uniqueIndex, integer } from "drizzle-orm/pg-core";

export const savedPlaces = pgTable(
  "saved_places",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    userEmail: text("user_email"),
    placeId: text("place_id").notNull(),
    name: text("name").notNull(),
    vicinity: text("vicinity"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("user_place_unique").on(t.userId, t.placeId)]
);

export const placeVisits = pgTable("place_visits", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  savedPlaceId: text("saved_place_id")
    .notNull()
    .references(() => savedPlaces.id, { onDelete: "cascade" }),
  rating: integer("rating"),
  note: text("note"),
  visitedAt: timestamp("visited_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("push_endpoint_unique").on(t.endpoint)]
);

export type SavedPlace = typeof savedPlaces.$inferSelect;
export type NewSavedPlace = typeof savedPlaces.$inferInsert;
export type PlaceVisit = typeof placeVisits.$inferSelect;
export type NewPlaceVisit = typeof placeVisits.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
