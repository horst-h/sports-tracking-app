import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two devices, one backend.
 *
 * Every case here is a way the goals on a desktop and a phone drifted apart and
 * stayed apart: a sport whose version happened to sit below another's, a
 * swimming goal with nowhere to sync to, a cleared goal that came back. The
 * point of the suite is that no single-device test can see any of them.
 */

// ---- the shared backend ----

type StoredGoal = {
  subject: string;
  year: number;
  sport: string;
  distanceKm?: number;
  count?: number;
  elevationM?: number;
  createdAt: string;
  updatedAt: string;
  version: number;
};

const backend = new Map<string, StoredGoal>();
let clock = 0;
let reachable = true;
/** The backend answers, but its storage is down — a 503, never an empty 200. */
let storageDown = false;

/** Distinct, ordered timestamps — the backend's own `updatedAt` is what the
 *  clients compare against, so two writes must never share one. */
function stamp(): string {
  clock += 1;
  return `2026-01-01T00:00:${String(clock).padStart(2, "0")}.000Z`;
}

function backendKey(year: number, sport: string) {
  return `${year}:${sport}`;
}

/** Mirrors netlify/functions/goals.ts: per-sport records, version bumped on write. */
const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  if (!reachable) throw new TypeError("Failed to fetch");

  const [path, query] = input.split("?");
  expect(path).toBe("/.netlify/functions/goals");
  const params = new URLSearchParams(query ?? "");
  const method = init?.method ?? "GET";

  // The content type is part of the contract, not decoration: the client uses
  // it to tell a real answer from the SPA catch-all serving index.html.
  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  });

  if (storageDown) {
    return {
      ok: false,
      status: 503,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: "storage_unavailable" }),
    };
  }

  if (method === "GET") {
    const key = backendKey(Number(params.get("year")), params.get("sport")!);
    return ok({ goal: backend.get(key) ?? null });
  }

  if (method === "PUT") {
    const body = JSON.parse(String(init!.body));
    const { year, sport, ...data } = body;
    const key = backendKey(year, sport);
    const existing = backend.get(key);
    const saved: StoredGoal = {
      subject: "google:1",
      year,
      sport,
      ...data,
      createdAt: existing?.createdAt ?? stamp(),
      updatedAt: stamp(),
      version: (existing?.version ?? 0) + 1,
    };
    backend.set(key, saved);
    return ok({ goal: saved });
  }

  if (method === "DELETE") {
    const key = backendKey(Number(params.get("year")), params.get("sport")!);
    backend.delete(key);
    return ok({ ok: true });
  }

  throw new Error(`unexpected method ${method}`);
});

vi.stubGlobal("fetch", fetchMock);

// ---- the devices ----

const devices = new Map<string, Map<unknown, unknown>>();
let store: Map<unknown, unknown>;

function on(deviceName: string) {
  if (!devices.has(deviceName)) devices.set(deviceName, new Map());
  store = devices.get(deviceName)!;
}

vi.mock("./db.ts", () => ({
  openSportsDB: async () => ({
    get: async (_s: string, key: unknown) => store.get(key),
    put: async (_s: string, value: unknown, key: unknown) => {
      store.set(key, structuredClone(value));
    },
    delete: async (_s: string, key: unknown) => {
      store.delete(key);
    },
    getAllKeys: async () => [...store.keys()],
    clear: async () => store.clear(),
  }),
}));

let signedIn = true;

vi.mock("./googleSessionRepository.ts", () => ({
  hasSession: async () => signedIn,
}));

const { saveGoals, loadGoals } = await import("./goalsRepository.ts");

const YEAR = 2026;

function goalsFor(perSport: Record<string, Record<string, number>>) {
  return {
    year: YEAR,
    perSport: { run: {}, ride: {}, swim: {}, ...perSport },
  } as never;
}

/** Lets the background revalidation of loadGoals run to completion. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  backend.clear();
  devices.clear();
  clock = 0;
  reachable = true;
  storageDown = false;
  signedIn = true;
  fetchMock.mockClear();
  on("desktop");
});

describe("goals sync across devices", () => {
  it("carries an edit to a sport the other device wrote less often", async () => {
    // The original failure: one cached version number for the whole year, taken
    // as the maximum across sports. Running gets edited three times and sits at
    // version 3, cycling at version 1 — so a later change to cycling never
    // raised the maximum and the desktop ignored it for good.
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 100 } }));
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 200 } }));
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 }, ride: { distanceKm: 1000 } }));

    on("phone");
    expect(await loadGoals(YEAR)).toMatchObject({
      perSport: { run: { distanceKm: 300 }, ride: { distanceKm: 1000 } },
    });
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 }, ride: { distanceKm: 1500 } }));

    on("desktop");
    const fresh = vi.fn();
    const shown = await loadGoals(YEAR, fresh);
    expect(shown).toMatchObject({ perSport: { ride: { distanceKm: 1000 } } }); // stale cache first
    await settle();

    expect(fresh).toHaveBeenCalledOnce();
    expect(fresh.mock.calls[0][0]).toMatchObject({
      perSport: { run: { distanceKm: 300 }, ride: { distanceKm: 1500 } },
    });
    expect(await loadGoals(YEAR)).toMatchObject({ perSport: { ride: { distanceKm: 1500 } } });
  });

  it("keeps the goals when the backend's storage is down", async () => {
    // How the goals actually went missing in production: the Blobs credential
    // lapsed, every store read answered 401, and the API reported that as a
    // perfectly ordinary 200 `{goal: null}`. Both devices believed the goals had
    // been deleted elsewhere and erased their own copies to match, so the one
    // place the values still existed lost them too.
    //
    // A backend that cannot reach its storage has to say so. Anything else and
    // an expired token becomes data loss.
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 1103, count: 111 } }));

    storageDown = true;

    const fresh = vi.fn();
    expect(await loadGoals(YEAR, fresh)).toMatchObject({
      perSport: { run: { distanceKm: 1103, count: 111 } },
    });
    await settle();

    expect(fresh).not.toHaveBeenCalled();

    // And still there once the storage comes back, rather than a hole that got
    // written through to the backend in the meantime.
    storageDown = false;
    expect(await loadGoals(YEAR)).toMatchObject({
      perSport: { run: { distanceKm: 1103, count: 111 } },
    });
    expect(backend.get(backendKey(YEAR, "run"))).toMatchObject({ distanceKm: 1103, count: 111 });
  });

  it("does not delete a goal on the backend after a storage outage", async () => {
    // The dangerous half: a device whose local copy was already emptied will
    // push that emptiness as a DELETE the moment writes start working again.
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 1103 } }));

    on("phone");
    storageDown = true;
    await loadGoals(YEAR);
    await settle();
    await saveGoals(YEAR, goalsFor({}));
    await settle();

    storageDown = false;
    await loadGoals(YEAR);
    await settle();

    expect(backend.get(backendKey(YEAR, "run"))).toMatchObject({ distanceKm: 1103 });
  });

  it("syncs swimming goals", async () => {
    on("desktop");
    await saveGoals(YEAR, goalsFor({ swim: { distanceKm: 40, count: 60 } }));

    on("phone");
    expect(await loadGoals(YEAR)).toMatchObject({
      perSport: { swim: { distanceKm: 40, count: 60 } },
    });
  });

  it("propagates a cleared goal instead of resurrecting it", async () => {
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 }, ride: { distanceKm: 1000 } }));

    on("phone");
    await loadGoals(YEAR);
    await saveGoals(YEAR, goalsFor({ ride: { distanceKm: 1000 } })); // running cleared

    expect(backend.has(backendKey(YEAR, "run"))).toBe(false);

    // And it stays cleared on the phone itself, rather than coming back on the
    // next cache miss.
    on("phone-after-reinstall");
    expect(await loadGoals(YEAR)).toMatchObject({
      perSport: { run: {}, ride: { distanceKm: 1000 } },
    });

    on("desktop");
    const fresh = vi.fn();
    await loadGoals(YEAR, fresh);
    await settle();
    expect(fresh.mock.calls[0][0]).toMatchObject({ perSport: { run: {} } });
  });

  it("removes a goal that was deleted on the other device", async () => {
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 } }));

    on("phone");
    await loadGoals(YEAR);
    backend.delete(backendKey(YEAR, "run"));

    const fresh = vi.fn();
    await loadGoals(YEAR, fresh);
    await settle();
    expect(fresh.mock.calls[0][0]).toMatchObject({ perSport: { run: {} } });
  });

  it("reports a save that stayed local, then pushes it on the next load", async () => {
    on("phone");
    reachable = false;
    const result = await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 } }));
    expect(result.synced).toBe(false);
    expect(backend.size).toBe(0);

    reachable = true;
    await loadGoals(YEAR);
    await settle();

    expect(backend.get(backendKey(YEAR, "run"))).toMatchObject({ distanceKm: 300 });

    on("desktop");
    expect(await loadGoals(YEAR)).toMatchObject({ perSport: { run: { distanceKm: 300 } } });
  });

  it("keeps local goals when the backend cannot be reached", async () => {
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 } }));

    reachable = false;
    const fresh = vi.fn();
    expect(await loadGoals(YEAR, fresh)).toMatchObject({
      perSport: { run: { distanceKm: 300 } },
    });
    await settle();
    expect(fresh).not.toHaveBeenCalled();

    // Same for a signed-out session: no answer is not an answer.
    reachable = true;
    signedIn = false;
    expect(await loadGoals(YEAR)).toMatchObject({ perSport: { run: { distanceKm: 300 } } });
    await settle();
    expect(await loadGoals(YEAR)).toMatchObject({ perSport: { run: { distanceKm: 300 } } });
  });

  it("lets the newer remote edit win over an unpushed local one", async () => {
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 } }));

    on("phone");
    await loadGoals(YEAR);
    await settle();

    // The phone edits while offline; the desktop edits after that and gets through.
    reachable = false;
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 400 } }));
    reachable = true;

    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 500 } }));

    on("phone");
    const fresh = vi.fn();
    await loadGoals(YEAR, fresh);
    await settle();
    expect(fresh.mock.calls[0][0]).toMatchObject({ perSport: { run: { distanceKm: 500 } } });
    expect(backend.get(backendKey(YEAR, "run"))).toMatchObject({ distanceKm: 500 });
  });

  it("uploads goals from an older cache instead of erasing them", async () => {
    // What a device upgrading from the v1 cache actually holds: goals that were
    // never sent (swimming could not be), alongside one the backend also knows.
    on("desktop");
    store.set(YEAR, {
      schemaVersion: 1,
      year: YEAR,
      goals: goalsFor({ run: { distanceKm: 300 }, swim: { count: 50 } }),
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 7,
    });

    await loadGoals(YEAR);
    await settle();

    expect(backend.get(backendKey(YEAR, "swim"))).toMatchObject({ count: 50 });
    expect(backend.get(backendKey(YEAR, "run"))).toMatchObject({ distanceKm: 300 });

    on("phone");
    expect(await loadGoals(YEAR)).toMatchObject({
      perSport: { run: { distanceKm: 300 }, swim: { count: 50 } },
    });
  });

  it("does not rewrite sports that did not change", async () => {
    on("desktop");
    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 300 }, ride: { distanceKm: 1000 } }));
    const rideBefore = backend.get(backendKey(YEAR, "ride"))!.updatedAt;

    await saveGoals(YEAR, goalsFor({ run: { distanceKm: 350 }, ride: { distanceKm: 1000 } }));

    // Touching cycling here would make every other device re-adopt a value it
    // already has, for no reason.
    expect(backend.get(backendKey(YEAR, "ride"))!.updatedAt).toBe(rideBefore);
    expect(backend.get(backendKey(YEAR, "run"))).toMatchObject({ distanceKm: 350 });
  });
});
