import { openDB } from "idb";
import type { Activity } from "../domain/activity";

const DB_NAME = "sports-tracking";
const STORE = "activitiesByYear";

type CachedYearActivities = {
  year: number;
  fetchedAt: number;      // epoch ms
  activities: Activity[];
};

async function db() {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // auth store exists in v1 in your tokenRepository
        if (!db.objectStoreNames.contains("auth")) db.createObjectStore("auth");
      }
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

export async function loadYearActivities(year: number): Promise<CachedYearActivities | null> {
  const d = await db();
  return (await d.get(STORE, year)) ?? null;
}

export async function saveYearActivities(year: number, activities: Activity[]) {
  const d = await db();
  const payload: CachedYearActivities = {
    year,
    fetchedAt: Date.now(),
    activities,
  };
  await d.put(STORE, payload, year);
}

export async function clearYearActivities(year: number) {
  const d = await db();
  await d.delete(STORE, year);
}
