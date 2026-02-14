import { openDB } from "idb";

const DB_NAME = "sports-tracking";
const DB_VERSION = 4;

/**
 * Centralized IndexedDB initialization.
 * All object stores must be created here in a single upgrade callback.
 */
export async function openSportsDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create stores if they don't exist (idempotent)
      if (!db.objectStoreNames.contains("auth")) {
        db.createObjectStore("auth");
      }
      if (!db.objectStoreNames.contains("activitiesByYear")) {
        db.createObjectStore("activitiesByYear");
      }
      if (!db.objectStoreNames.contains("goals")) {
        db.createObjectStore("goals");
      }

      // future: if (oldVersion < 5) { ... migrations ... }
    },
  });
}
