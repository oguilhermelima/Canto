import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Auth tables (better-auth compatible) ───

export const user = pgTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: varchar("image", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("user"), // 'admin' | 'user'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: varchar("id", { length: 36 }).primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: varchar("scope", { length: 255 }),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── User Preferences ───

export const userPreference = pgTable("user_preference", {
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  value: jsonb("value").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.key] }),
]);

// ─── Library tables ───

export const library = pgTable("library", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  /** "movies" | "shows" | "animes" */
  type: varchar("type", { length: 20 }).notNull(),
  /** Path inside Jellyfin container, e.g. "/media/Movies" */
  jellyfinPath: varchar("jellyfin_path", { length: 500 }),
  /** qBittorrent category name, e.g. "movies" */
  qbitCategory: varchar("qbit_category", { length: 100 }),
  /** Jellyfin library ID for triggering targeted scans */
  jellyfinLibraryId: varchar("jellyfin_library_id", { length: 100 }),
  /** Whether this is the default library for its type */
  isDefault: boolean("is_default").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Media tables ───

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 10 }).notNull(), // 'movie' | 'show'
    externalId: integer("external_id").notNull(),
    provider: varchar("provider", { length: 20 }).notNull(), // 'tmdb' | 'anilist' | 'tvdb'

    // Identity
    title: varchar("title", { length: 500 }).notNull(),
    originalTitle: varchar("original_title", { length: 500 }),
    overview: text("overview"),
    tagline: varchar("tagline", { length: 500 }),

    // Dates
    releaseDate: date("release_date"),
    year: integer("year"),
    lastAirDate: date("last_air_date"),

    // Classification
    status: varchar("status", { length: 50 }),
    genres: jsonb("genres").$type<string[]>().default([]),
    contentRating: varchar("content_rating", { length: 20 }),
    originalLanguage: varchar("original_language", { length: 10 }),
    spokenLanguages: jsonb("spoken_languages").$type<string[]>(),
    originCountry: jsonb("origin_country").$type<string[]>(),

    // Metrics
    voteAverage: real("vote_average"),
    voteCount: integer("vote_count"),
    popularity: real("popularity"),
    runtime: integer("runtime"),

    // Images
    posterPath: varchar("poster_path", { length: 255 }),
    backdropPath: varchar("backdrop_path", { length: 255 }),
    logoPath: varchar("logo_path", { length: 255 }),

    // External IDs
    imdbId: varchar("imdb_id", { length: 20 }),
    anilistId: integer("anilist_id"),
    anilistScore: real("anilist_score"),

    // TV-specific
    numberOfSeasons: integer("number_of_seasons"),
    numberOfEpisodes: integer("number_of_episodes"),
    inProduction: boolean("in_production"),
    networks: jsonb("networks").$type<string[]>(),

    // Movie-specific
    budget: bigint("budget", { mode: "number" }),
    revenue: bigint("revenue", { mode: "number" }),
    collection: jsonb("collection").$type<{
      id: number;
      name: string;
      posterPath?: string;
    } | null>(),

    // Production
    productionCompanies:
      jsonb("production_companies").$type<
        { id: number; name: string; logoPath?: string }[]
      >(),
    productionCountries: jsonb("production_countries").$type<string[]>(),

    // Library state
    libraryId: uuid("library_id").references(() => library.id, {
      onDelete: "set null",
    }),
    inLibrary: boolean("in_library").notNull().default(false),
    libraryPath: varchar("library_path", { length: 500 }),
    addedAt: timestamp("added_at", { withTimezone: true }),
    continuousDownload: boolean("continuous_download").notNull().default(false),

    // Timestamps
    metadataUpdatedAt: timestamp("metadata_updated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_media_external").on(table.externalId, table.provider),
    index("idx_media_type").on(table.type),
    index("idx_media_in_library").on(table.inLibrary),
    index("idx_media_provider").on(table.provider, table.externalId),
  ],
);

export const season = pgTable(
  "season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    externalId: integer("external_id"),
    name: varchar("name", { length: 255 }),
    overview: text("overview"),
    airDate: date("air_date"),
    posterPath: varchar("poster_path", { length: 255 }),
    episodeCount: integer("episode_count"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_season_media_number").on(table.mediaId, table.number),
  ],
);

export const episode = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    externalId: integer("external_id"),
    title: varchar("title", { length: 500 }),
    overview: text("overview"),
    airDate: date("air_date"),
    runtime: integer("runtime"),
    stillPath: varchar("still_path", { length: 255 }),
    voteAverage: real("vote_average"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_episode_season_number").on(table.seasonId, table.number),
  ],
);

export const torrent = pgTable("torrent", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
  hash: varchar("hash", { length: 100 }).unique(),
  title: varchar("title", { length: 500 }).notNull(),
  /** "movie" | "season" | "episode" */
  downloadType: varchar("download_type", { length: 20 }).notNull().default("movie"),
  seasonNumber: integer("season_number"),
  episodeNumbers: jsonb("episode_numbers").$type<number[]>(),
  status: varchar("status", { length: 20 }).notNull().default("unknown"),
  quality: varchar("quality", { length: 20 }).notNull().default("unknown"),
  source: varchar("source", { length: 20 }).notNull().default("unknown"),
  progress: real("progress").notNull().default(0),
  contentPath: varchar("content_path", { length: 1000 }),
  fileSize: bigint("file_size", { mode: "number" }),
  magnetUrl: text("magnet_url"),
  downloadUrl: text("download_url"),
  imported: boolean("imported").notNull().default(false),
  importing: boolean("importing").notNull().default(false),
  usenet: boolean("usenet").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mediaFile = pgTable(
  "media_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    torrentId: uuid("torrent_id").references(() => torrent.id, {
      onDelete: "set null",
    }),
    filePath: varchar("file_path", { length: 1000 }).notNull(),
    quality: varchar("quality", { length: 20 }).default("unknown"),
    source: varchar("source", { length: 20 }).default("unknown"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_media_file_media").on(table.mediaId),
    index("idx_media_file_torrent").on(table.torrentId),
  ],
);

export const extrasCache = pgTable("extras_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" })
    .unique(),
  data: jsonb("data").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Relations ───

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  preferences: many(userPreference),
}));

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, {
    fields: [userPreference.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const libraryRelations = relations(library, ({ many }) => ({
  media: many(media),
}));

export const mediaRelations = relations(media, ({ many, one }) => ({
  library: one(library, {
    fields: [media.libraryId],
    references: [library.id],
  }),
  seasons: many(season),
  files: many(mediaFile),
  extrasCache: one(extrasCache, {
    fields: [media.id],
    references: [extrasCache.mediaId],
  }),
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
  media: one(media, {
    fields: [season.mediaId],
    references: [media.id],
  }),
  episodes: many(episode),
}));

export const episodeRelations = relations(episode, ({ one, many }) => ({
  season: one(season, {
    fields: [episode.seasonId],
    references: [season.id],
  }),
  files: many(mediaFile),
}));

export const torrentRelations = relations(torrent, ({ many }) => ({
  files: many(mediaFile),
}));

export const mediaFileRelations = relations(mediaFile, ({ one }) => ({
  media: one(media, {
    fields: [mediaFile.mediaId],
    references: [media.id],
  }),
  episode: one(episode, {
    fields: [mediaFile.episodeId],
    references: [episode.id],
  }),
  torrent: one(torrent, {
    fields: [mediaFile.torrentId],
    references: [torrent.id],
  }),
}));

export const extrasCacheRelations = relations(extrasCache, ({ one }) => ({
  media: one(media, {
    fields: [extrasCache.mediaId],
    references: [media.id],
  }),
}));
