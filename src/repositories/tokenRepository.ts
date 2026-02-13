import { openSportsDB } from "./db";

export type TokenData = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

const STORE = "auth";

export async function saveToken(token: TokenData) {
  const d = await openSportsDB();
  await d.put(STORE, token, "token");
}

export async function loadToken(): Promise<TokenData | null> {
  const d = await openSportsDB();
  return (await d.get(STORE, "token")) ?? null;
}

export async function clearToken() {
  const d = await openSportsDB();
  await d.delete(STORE, "token");
}
