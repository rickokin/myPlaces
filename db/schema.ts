import { pgTable, text, timestamp, uniqueIndex, integer } from "drizzle-orm/pg-core";

export const savedPlaces = pgTable(
  "saved_places",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
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

export type SavedPlace = typeof savedPlaces.$inferSelect;
export type NewSavedPlace = typeof savedPlaces.$inferInsert;
export type PlaceVisit = typeof placeVisits.$inferSelect;
export type NewPlaceVisit = typeof placeVisits.$inferInsert;
