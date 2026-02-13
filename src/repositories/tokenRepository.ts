import { openDB } from "idb";

export type TokenData = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

const DB_NAME = "sports-tracking";
const DB_VERSION = 2;      // ✅ wichtig: gleich wie activitiesRepository
const STORE = "auth";

async function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      // ggf. weitere Stores hier nicht anlegen – das macht das andere Repo
    },
  });
}

export async function saveToken(token: TokenData) {
  const d = await db();
  await d.put(STORE, token, "token");
}

export async function loadToken(): Promise<TokenData | null> {
  const d = await db();
  return (await d.get(STORE, "token")) ?? null;
}

export async function clearToken() {
  const d = await db();
  await d.delete(STORE, "token");
}
