import { getStore } from "@netlify/blobs";
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
  private store: any;

  /**
   * The store runs on the function's own Blobs context, with no credentials of
   * ours anywhere near it.
   *
   * It used to pass `NETLIFY_SITE_ID` + `NETLIFY_AUTH_TOKEN` through by hand,
   * and that is exactly how the goals went dark: a personal access token
   * expires, every Blobs call started answering 401, and because the layers
   * above read that as "there is no goal", the local copies were deleted to
   * match. A credential the deployment does not hold cannot lapse. Explicit
   * `BLOBS_SITE_ID` + `BLOBS_TOKEN` still override, for running this outside a
   * Netlify runtime — but nothing is picked up ambiently any more.
   */
  constructor() {
    const siteID = process.env.BLOBS_SITE_ID;
    const token = process.env.BLOBS_TOKEN;

    if (siteID && token) {
      console.info("[NetlifyBlobsGoalsStore] Using explicit BLOBS_* credentials");
      this.store = getStore("goals", { siteID, token });
    } else {
      console.info("[NetlifyBlobsGoalsStore] Using the runtime Blobs context");
      this.store = getStore("goals");
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

  /**
   * Throws when the store cannot be reached, and returns null only when it
   * answered and held nothing.
   *
   * The distinction is the whole point. This used to swallow the error and
   * return null, which travelled up as HTTP 200 `{goal: null}` — an authoritative
   * "you have no goal here" — and the clients dutifully erased their local
   * copies to match. A store that cannot answer must not get to say what is in
   * it.
   */
  async get(subject: string, year: number, sport: Sport): Promise<StoredGoal | null> {
    const key = this.key(subject, year, sport);
    const json = await this.store.get(key, { type: "json" });
    if (json) {
      console.info(`[NetlifyBlobsGoalsStore] Retrieved goal: ${key}`);
      return json;
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

    const legacy = await this.store.get(legacyKey, { type: "json" });
    if (!legacy) return null;

    const adopted: StoredGoal = { ...legacy, subject, year, sport };
    await this.store.setJSON(this.key(subject, year, sport), adopted);
    console.info(`[NetlifyBlobsGoalsStore] Adopted ${legacyKey} as ${this.key(subject, year, sport)}`);
    return adopted;
  }

  async set(goal: StoredGoal): Promise<StoredGoal> {
    const key = this.key(goal.subject, goal.year, goal.sport);
    await this.store.setJSON(key, goal);
    console.info(`[NetlifyBlobsGoalsStore] Saved goal: ${key}`);
    return goal;
  }

  /** Throws rather than reporting a failed deletion as a completed one. */
  async delete(subject: string, year: number, sport: Sport): Promise<boolean> {
    const key = this.key(subject, year, sport);
    await this.store.delete(key);
    console.info(`[NetlifyBlobsGoalsStore] Deleted goal: ${key}`);
    return true;
  }
}

/**
 * Creates the store, or throws.
 *
 * There is deliberately no fallback. Dropping to an in-memory store when Blobs
 * cannot be reached reads as success at every layer above — writes are accepted,
 * reads come back empty, and the goals quietly cease to exist. Only an explicit
 * `GOALS_STORE=memory` gets a throwaway store, because that is someone asking
 * for one.
 */
export function createGoalsStore(): GoalsStore {
  if (process.env.GOALS_STORE === "memory") {
    console.warn("[GoalsStore] ⚠️ GOALS_STORE=memory set - using in-memory store (NOT PERSISTED)");
    return new InMemoryGoalsStore();
  }

  return new NetlifyBlobsGoalsStore();
}
