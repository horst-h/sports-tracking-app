import type { StoredGoal, Sport, GoalData } from "./types";

/**
 * Storage interface for Goals.
 * Implementations can use Netlify Blobs, in-memory, or other backends.
 */
export interface GoalsStore {
  get(athleteId: number, year: number, sport: Sport): Promise<StoredGoal | null>;
  set(goal: StoredGoal): Promise<StoredGoal>;
  delete(athleteId: number, year: number, sport: Sport): Promise<boolean>;
}

/**
 * In-Memory implementation (for dev/fallback).
 */
export class InMemoryGoalsStore implements GoalsStore {
  private store = new Map<string, StoredGoal>();

  private key(athleteId: number, year: number, sport: Sport): string {
    return `${athleteId}:${year}:${sport}`;
  }

  async get(athleteId: number, year: number, sport: Sport): Promise<StoredGoal | null> {
    return this.store.get(this.key(athleteId, year, sport)) ?? null;
  }

  async set(goal: StoredGoal): Promise<StoredGoal> {
    this.store.set(this.key(goal.athleteId, goal.year, goal.sport), goal);
    return goal;
  }

  async delete(athleteId: number, year: number, sport: Sport): Promise<boolean> {
    return this.store.delete(this.key(athleteId, year, sport));
  }
}

/**
 * Netlify Blobs implementation.
 * Uses @netlify/blobs to persist goals as JSON files.
 * Key pattern: goals/<athleteId>/<year>/<sport>.json
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

  private key(athleteId: number, year: number, sport: Sport): string {
    return `goals/${athleteId}/${year}/${sport}`;
  }

  async get(athleteId: number, year: number, sport: Sport): Promise<StoredGoal | null> {
    try {
      const key = this.key(athleteId, year, sport);
      const json = await this.store.get(key, { type: "json" });
      if (json) {
        console.info(`[NetlifyBlobsGoalsStore] Retrieved goal: ${key}`, json);
      }
      return json ?? null;
    } catch (error) {
      console.error(`[NetlifyBlobsGoalsStore] Error retrieving goal: athleteId=${athleteId}, year=${year}, sport=${sport}`, error);
      return null;
    }
  }

  async set(goal: StoredGoal): Promise<StoredGoal> {
    try {
      const key = this.key(goal.athleteId, goal.year, goal.sport);
      await this.store.setJSON(key, goal);
      console.info(`[NetlifyBlobsGoalsStore] Saved goal: ${key}`, goal);
      return goal;
    } catch (error) {
      console.error("[NetlifyBlobsGoalsStore] Error saving goal:", error, goal);
      throw error;
    }
  }

  async delete(athleteId: number, year: number, sport: Sport): Promise<boolean> {
    try {
      const key = this.key(athleteId, year, sport);
      await this.store.delete(key);
      console.info(`[NetlifyBlobsGoalsStore] Deleted goal: ${key}`);
      return true;
    } catch (error) {
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
