import type { StoredGoal, Sport } from "./types";

/**
 * Storage interface for Goals.
 * Implementations can use Netlify Blobs, in-memory, or other backends.
 */
export interface GoalsStore {
  get(subject: string, year: number, sport: Sport): Promise<StoredGoal | null>;
  set(goal: StoredGoal): Promise<StoredGoal>;
  delete(subject: string, year: number, sport: Sport): Promise<boolean>;
}

/**
 * Subjects go into blob keys, so they must not be able to escape their own
 * prefix. "google:<sub>" is already safe — Google subjects are digits — but the
 * key builder should not depend on that staying true.
 */
function safeSubject(subject: string): string {
  return subject.replace(/[^A-Za-z0-9:_-]/g, "_");
}

/**
 * In-Memory implementation (for dev/fallback).
 */
export class InMemoryGoalsStore implements GoalsStore {
  private store = new Map<string, StoredGoal>();

  private key(subject: string, year: number, sport: Sport): string {
    return `${safeSubject(subject)}:${year}:${sport}`;
  }

  async get(subject: string, year: number, sport: Sport): Promise<StoredGoal | null> {
    return this.store.get(this.key(subject, year, sport)) ?? null;
  }

  async set(goal: StoredGoal): Promise<StoredGoal> {
    this.store.set(this.key(goal.subject, goal.year, goal.sport), goal);
    return goal;
  }

  async delete(subject: string, year: number, sport: Sport): Promise<boolean> {
    return this.store.delete(this.key(subject, year, sport));
  }
}

/**
 * Netlify Blobs implementation.
 * Uses @netlify/blobs to persist goals as JSON files.
 * Key pattern: goals/<subject>/<year>/<sport>
 */
export class NetlifyBlobsGoalsStore implements GoalsStore {
  private getStore: any;
  private store: any;
  private storeOptions?: { siteID: string; token: string };

  constructor() {
    // Lazy-load @netlify/blobs
    try {
      const { getStore } = require("@netlify/blobs");
      this.getStore = getStore;

      const siteID =
        process.env.NETLIFY_SITE_ID ??
        process.env.SITE_ID ??
        process.env.BLOBS_SITE_ID;
      const token =
        process.env.NETLIFY_AUTH_TOKEN ??
        process.env.NETLIFY_API_TOKEN ??
        process.env.BLOBS_TOKEN;

      if (siteID && token) {
        this.storeOptions = { siteID, token };
        console.info("[NetlifyBlobsGoalsStore] Using manual Blobs credentials from environment");
      } else {
        console.info("[NetlifyBlobsGoalsStore] Using runtime Blobs environment context (auto)");
      }

      // Eagerly create the store so missing environment is detected here,
      // allowing factory fallback to in-memory store.
      this.store = this.storeOptions
        ? this.getStore("goals", this.storeOptions)
        : this.getStore("goals");

      console.info("[NetlifyBlobsGoalsStore] Initialized successfully");
    } catch (error) {
      console.error("[NetlifyBlobsGoalsStore] Initialization failed:", error);
      throw new Error("Netlify Blobs initialization failed");
    }
  }

  private key(subject: string, year: number, sport: Sport): string {
    return `goals/${safeSubject(subject)}/${year}/${sport}`;
  }

  /**
   * Where a goal sat before identity moved to Google: under the bare Strava
   * athlete id. Only consulted when LEGACY_GOALS_ATHLETE_ID names one, so this
   * cannot accidentally read another account's data.
   */
  private legacyKey(year: number, sport: Sport): string | null {
    const athleteId = (process.env.LEGACY_GOALS_ATHLETE_ID ?? "").trim();
    if (!/^\d+$/.test(athleteId)) return null;
    return `goals/${athleteId}/${year}/${sport}`;
  }

  async get(subject: string, year: number, sport: Sport): Promise<StoredGoal | null> {
    const key = this.key(subject, year, sport);
    try {
      const json = await this.store.get(key, { type: "json" });
      if (json) {
        console.info(`[NetlifyBlobsGoalsStore] Retrieved goal: ${key}`);
        return json;
      }
    } catch (error) {
      console.error(`[NetlifyBlobsGoalsStore] Error retrieving goal: ${key}`, error);
      return null;
    }

    return this.adoptLegacy(subject, year, sport);
  }

  /**
   * Copies a pre-Google goal to its new key the first time it is asked for.
   *
   * Lazy rather than a migration pass: it needs no listing, it cannot run
   * halfway, and a goal that is never read is never touched. The original is
   * left in place, so this stays reversible.
   */
  private async adoptLegacy(
    subject: string,
    year: number,
    sport: Sport
  ): Promise<StoredGoal | null> {
    const legacyKey = this.legacyKey(year, sport);
    if (!legacyKey) return null;

    try {
      const legacy = await this.store.get(legacyKey, { type: "json" });
      if (!legacy) return null;

      const adopted: StoredGoal = { ...legacy, subject, year, sport };
      await this.store.setJSON(this.key(subject, year, sport), adopted);
      console.info(`[NetlifyBlobsGoalsStore] Adopted ${legacyKey} as ${this.key(subject, year, sport)}`);
      return adopted;
    } catch (error) {
      console.error(`[NetlifyBlobsGoalsStore] Could not adopt ${legacyKey}`, error);
      return null;
    }
  }

  async set(goal: StoredGoal): Promise<StoredGoal> {
    const key = this.key(goal.subject, goal.year, goal.sport);
    try {
      await this.store.setJSON(key, goal);
      console.info(`[NetlifyBlobsGoalsStore] Saved goal: ${key}`);
      return goal;
    } catch (error) {
      console.error(`[NetlifyBlobsGoalsStore] Error saving goal: ${key}`, error);
      throw error;
    }
  }

  async delete(subject: string, year: number, sport: Sport): Promise<boolean> {
    const key = this.key(subject, year, sport);
    try {
      await this.store.delete(key);
      console.info(`[NetlifyBlobsGoalsStore] Deleted goal: ${key}`);
      return true;
    } catch (error) {
      // Previously referenced `key` from inside the try block, which threw a
      // ReferenceError and masked the real failure.
      console.error(`[NetlifyBlobsGoalsStore] Error deleting goal: ${key}`, error);
      return false;
    }
  }
}

/**
 * Factory: creates the appropriate store based on environment.
 */
export function createGoalsStore(): GoalsStore {
  const forceMemory = process.env.GOALS_STORE === "memory";

  console.info(
    "[GoalsStore] Creating store - NETLIFY:",
    process.env.NETLIFY,
    "CONTEXT:",
    process.env.CONTEXT,
    "NODE_ENV:",
    process.env.NODE_ENV,
    "GOALS_STORE:",
    process.env.GOALS_STORE
  );

  if (forceMemory) {
    console.warn("[GoalsStore] ⚠️ GOALS_STORE=memory set - using in-memory store (NOT PERSISTED)");
    return new InMemoryGoalsStore();
  }

  try {
    console.info("[GoalsStore] Attempting to initialize Netlify Blobs store...");
    const store = new NetlifyBlobsGoalsStore();
    console.info("[GoalsStore] ✅ Successfully using Netlify Blobs for persistence");
    return store;
  } catch (error) {
    console.error("[GoalsStore] ❌ Netlify Blobs initialization failed, falling back to in-memory (NOT PERSISTED):", error);
    return new InMemoryGoalsStore();
  }
}
