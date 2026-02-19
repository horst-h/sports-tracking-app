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

  constructor() {
    // Lazy-load @netlify/blobs
    try {
      const { getStore } = require("@netlify/blobs");
      this.getStore = getStore;
    } catch {
      throw new Error("@netlify/blobs not available");
    }
  }

  private key(athleteId: number, year: number, sport: Sport): string {
    return `goals/${athleteId}/${year}/${sport}`;
  }

  async get(athleteId: number, year: number, sport: Sport): Promise<StoredGoal | null> {
    try {
      const store = this.getStore("goals");
      const json = await store.get(this.key(athleteId, year, sport), { type: "json" });
      return json ?? null;
    } catch {
      return null;
    }
  }

  async set(goal: StoredGoal): Promise<StoredGoal> {
    const store = this.getStore("goals");
    await store.setJSON(this.key(goal.athleteId, goal.year, goal.sport), goal);
    return goal;
  }

  async delete(athleteId: number, year: number, sport: Sport): Promise<boolean> {
    try {
      const store = this.getStore("goals");
      await store.delete(this.key(athleteId, year, sport));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Factory: creates the appropriate store based on environment.
 */
export function createGoalsStore(): GoalsStore {
  const isNetlify = process.env.NETLIFY === "true";

  if (!isNetlify) {
    console.info("[GoalsStore] Using in-memory store (local development)");
    return new InMemoryGoalsStore();
  }

  try {
    return new NetlifyBlobsGoalsStore();
  } catch (error) {
    console.warn("[GoalsStore] Netlify Blobs unavailable, using in-memory fallback:", error);
    return new InMemoryGoalsStore();
  }
}
