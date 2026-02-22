import { openSportsDB } from "./db";
import type { Activity } from "../domain/activity";

const STORE = "activitiesByYear";

type CachedYearActivities = {
  year: number;
  fetchedAt: number;      // epoch ms
  activities: Activity[];
};

export async function loadYearActivities(year: number): Promise<CachedYearActivities | null> {
  const d = await openSportsDB();
  return (await d.get(STORE, year)) ?? null;
}

export async function saveYearActivities(year: number, activities: Activity[]) {
  const d = await openSportsDB();
  const payload: CachedYearActivities = {
    year,
    fetchedAt: Date.now(),
    activities,
  };
  await d.put(STORE, payload, year);
}

export async function clearYearActivities(year: number) {
  const d = await openSportsDB();
  await d.delete(STORE, year);
}

export async function listCachedYears(): Promise<number[]> {
  const d = await openSportsDB();
  const keys = await d.getAllKeys(STORE);
  return keys
    .map((key) => Number(key))
    .filter((key) => Number.isFinite(key));
}
