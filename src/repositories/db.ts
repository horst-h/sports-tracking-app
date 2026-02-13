import { openDB } from "idb";

const DB_NAME = "sports-tracking";
const DB_VERSION = 2;

/**
 * Centralized IndexedDB initialization.
 * All object stores must be created here in a single upgrade callback.
 */
export async function openSportsDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create "auth" store for tokens
      if (!db.objectStoreNames.contains("auth")) {
        db.createObjectStore("auth");
      }

      // Create "activitiesByYear" store for cached activities
      if (!db.objectStoreNames.contains("activitiesByYear")) {
        db.createObjectStore("activitiesByYear");
      }
    },
  });
}
