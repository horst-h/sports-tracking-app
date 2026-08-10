/**
 * AP0 — Runalyze API spike.
 *
 * Answers, in one run, every question the migration estimate is still
 * guessing at:
 *
 *   1. Does the token work, and does it actually have read access?
 *   2. Is `distance` in kilometres or metres?  (a factor-1000 error would
 *      corrupt every goal and forecast in the app)
 *   3. What does `date_time` look like, and how does `timezone_offset`
 *      combine with it?
 *   4. Which sport ids does *this account* use?  (they are account specific
 *      and there is no endpoint to list them)
 *   5. How does pagination behave, and are there rate limit headers?
 *   6. Does Runalyze's `elevation_up` match what the device recorded in
 *      `elevation_up_file`?  Runalyze can substitute map-based altitude, and
 *      that difference lands straight in a yearly elevation goal.
 *   7. Is the history complete, per year and sport, so it can be compared
 *      against the numbers currently cached from Strava?
 *   8. Are there duplicates from importing the same activity twice?
 *
 * READ ONLY. This script never issues anything but GET requests.
 *
 * Usage:
 *   RUNALYZE_API_TOKEN=xxxx npm run spike:runalyze
 *   RUNALYZE_API_TOKEN=xxxx npm run spike:runalyze -- --max-pages 2
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Load .env if present, so the token can live next to the other local
 * secrets instead of having to be exported in every shell. Node's own
 * loader; no dependency. Real environment variables still win, which is
 * what CI and `netlify dev` rely on.
 */
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* a malformed .env should not stop the spike from running */
  }
}

const BASE = "https://runalyze.com/api/v1";
const OUT_DIR = "spike-output";
const PER_PAGE = 200;
const DEFAULT_MAX_PAGES = 50;

// ---------------------------------------------------------------- utilities

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function heading(n: number, title: string) {
  console.log(`\n${b(`${n}. ${title}`)}\n${"─".repeat(60)}`);
}

function table(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) {
    console.log(dim("  (none)"));
    return;
  }
  const cols = Object.keys(rows[0]);
  const width = Object.fromEntries(
    cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c]).length))])
  );
  const line = (cells: Array<string | number>) =>
    "  " + cells.map((v, i) => String(v).padEnd(width[cols[i]])).join("  ");
  console.log(dim(line(cols)));
  console.log(dim("  " + cols.map((c) => "─".repeat(width[c])).join("  ")));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
}

function pct(part: number, total: number): string {
  return total === 0 ? "-" : `${((part / total) * 100).toFixed(1)}%`;
}

// ------------------------------------------------------------------ fetching

type RawActivity = Record<string, unknown>;

const token = process.env.RUNALYZE_API_TOKEN;
if (!token) {
  console.error(red("\nRUNALYZE_API_TOKEN is not set.\n"));
  console.error("Create a token at https://runalyze.com/settings/personal-api");
  console.error("Make sure you tick the READ scopes — a write-only token authenticates");
  console.error("fine but returns nothing, which looks exactly like an empty account.\n");
  console.error("Then either export it, or add this line to .env (gitignored):");
  console.error("  RUNALYZE_API_TOKEN=xxxx");
  console.error("\nDo NOT prefix it with VITE_ — Vite inlines those into the browser bundle.\n");
  process.exit(1);
}

const interestingHeaders = ["link", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"];

async function get(path: string): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  const res = await fetch(`${BASE}${path}`, { headers: { token: token as string, accept: "application/json" } });

  const headers: Record<string, string> = {};
  for (const h of interestingHeaders) {
    const v = res.headers.get(h);
    if (v) headers[h] = v;
  }

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep the raw text so error pages stay readable */
  }
  return { status: res.status, body, headers };
}

// ------------------------------------------------------------------ analyses

/**
 * Decides whether `distance` is kilometres or metres.
 *
 * Uses implied average speed rather than raw distance: a 5 km run and a
 * 5000 m run are indistinguishable by magnitude alone if someone logs very
 * long or very short sessions, but speed has a narrow plausible band.
 */
function inferDistanceUnit(activities: RawActivity[]) {
  const withBoth = activities.filter(
    (a) => typeof a.distance === "number" && typeof a.duration === "number" && (a.duration as number) > 60 && (a.distance as number) > 0
  );

  if (withBoth.length === 0) return { verdict: "unknown" as const, detail: "no activity has both distance and duration" };

  const speeds = withBoth.map((a) => (a.distance as number) / ((a.duration as number) / 3600));
  speeds.sort((x, y) => x - y);
  const median = speeds[Math.floor(speeds.length / 2)];

  const distances = withBoth.map((a) => a.distance as number).sort((x, y) => x - y);
  const medianDistance = distances[Math.floor(distances.length / 2)];

  // Human endurance speeds sit roughly between 3 and 60 km/h.
  const verdict = median >= 1 && median <= 80 ? ("km" as const) : median >= 1000 ? ("m" as const) : ("unclear" as const);

  return {
    verdict,
    detail: `median implied speed ${median.toFixed(1)} units/h, median distance ${medianDistance.toFixed(1)} units`,
    median,
    medianDistance,
  };
}

/**
 * Works out how date_time and timezone_offset relate.
 *
 * Activities cluster in waking hours. Whichever interpretation puts more
 * starts between 05:00 and 22:00 is the one that means local time.
 */
function inferTimeSemantics(activities: RawActivity[]) {
  const samples = activities.filter((a) => typeof a.date_time === "string").slice(0, 500);
  if (samples.length === 0) return null;

  const offsets = new Set(samples.map((a) => a.timezone_offset as number | null));

  const hourOf = (iso: string, addMinutes: number) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getTime() + addMinutes * 60_000).getUTCHours();
  };

  const daytime = (addOffset: boolean) =>
    samples.filter((a) => {
      const off = addOffset ? ((a.timezone_offset as number) ?? 0) : 0;
      const h = hourOf(a.date_time as string, off);
      return h !== null && h >= 5 && h < 22;
    }).length;

  const raw = daytime(false);
  const shifted = daytime(true);

  return {
    parseable: !Number.isNaN(new Date(samples[0].date_time as string).getTime()),
    sampleValues: samples.slice(0, 3).map((a) => String(a.date_time)),
    distinctOffsets: [...offsets].slice(0, 10),
    daytimeRaw: raw,
    daytimeWithOffset: shifted,
    total: samples.length,
    conclusion:
      shifted > raw
        ? "date_time looks like UTC; add timezone_offset to get local time"
        : raw >= shifted
          ? "date_time already looks like local time; timezone_offset is informational"
          : "inconclusive",
  };
}

/** Resolves an activity's local calendar date using whatever the inference concluded. */
function localDate(a: RawActivity, addOffset: boolean): Date | null {
  if (typeof a.date_time !== "string") return null;
  const d = new Date(a.date_time);
  if (Number.isNaN(d.getTime())) return null;
  const off = addOffset ? ((a.timezone_offset as number) ?? 0) : 0;
  return new Date(d.getTime() + off * 60_000);
}


/**
 * When activity read is denied, probe a spread of read endpoints to tell the
 * two plausible causes apart:
 *
 *   - every read endpoint denied  -> the token carries no read scopes at all
 *   - some succeed, activity does not -> the activity scope specifically is
 *     missing, or the subscription has not taken effect for it
 *
 * Runalyze assigns scopes per token, and tokens issued before the 2025 API
 * refactor keep only the permissions they had back then — a pre-existing
 * token stays write-only no matter which plan the account is on.
 *
 * All GET, all harmless.
 */
async function probeReadScopes() {
  const endpoints: Array<[string, string]> = [
    ["/activity?preset=latest", "Activity (needed by this app)"],
    ["/statistics/current", "Statistics (Supporter/Premium)"],
    ["/tag", "Tags"],
    ["/equipment", "Equipment"],
    ["/metrics/latest", "Health metrics"],
    ["/settings/date-range", "Account settings"],
    ["/raceresult", "Race results"],
  ];

  const rows: Array<Record<string, string | number>> = [];
  let ok = 0;

  for (const [path, label] of endpoints) {
    const res = await get(path);
    if (res.status === 200) ok++;
    rows.push({
      endpoint: path.split("?")[0],
      what: label,
      status: res.status === 200 ? "200 OK" : String(res.status),
    });
  }

  table(rows);
  return { reachable: ok, total: endpoints.length };
}

// ---------------------------------------------------------------------- main

async function main() {
  const maxPages = Number(arg("max-pages") ?? DEFAULT_MAX_PAGES);

  console.log(b("\nRunalyze API spike — read only\n"));
  console.log(dim(`base: ${BASE}   token: ****${(token as string).slice(-4)}   max pages: ${maxPages}`));

  // -- 1. reachability and read access ------------------------------------
  heading(1, "Token and read access");

  const ping = await get("/ping");
  console.log(`  GET /ping                 -> ${ping.status === 200 ? green(String(ping.status)) : yellow(String(ping.status))}`);

  const probe = await get("/activity?preset=latest");
  const probeOk = probe.status === 200;
  console.log(`  GET /activity?preset=latest -> ${probeOk ? green("200") : red(String(probe.status))}`);

  if (!probeOk) {
    console.log(red("\n  No read access to activities."));
    console.log("  Response:", JSON.stringify(probe.body).slice(0, 400));

    if (probe.status === 401) {
      console.log(yellow("\n  401 — the token itself is not accepted. Check for typos or expiry."));
      process.exit(2);
    }

    console.log(dim("\n  /ping answered, so the token is valid. Probing which reads are permitted:\n"));
    const scopes = await probeReadScopes();

    if (scopes.reachable === 0) {
      console.log(yellow("\n  Every read endpoint is denied -> the token has no read scopes."));
      console.log("  Create a NEW token at https://runalyze.com/settings/personal-api and tick");
      console.log("  the read permissions. Note that tokens issued before the 2025 API refactor");
      console.log("  keep only their original permissions — an existing token cannot gain read");
      console.log("  access, it has to be replaced.");
    } else {
      console.log(yellow(`\n  ${scopes.reachable}/${scopes.total} read endpoints work, but activities do not.`));
      console.log("  So reading in general is permitted and the activity scope specifically is");
      console.log("  missing. Re-issue the token with the activity read permission selected.");
      console.log("  If it is already selected, the subscription may not have propagated yet —");
      console.log("  worth a retry, and otherwise a question for Runalyze support.");
    }
    process.exit(2);
  }
  if (Object.keys(probe.headers).length) {
    console.log(dim(`  headers: ${JSON.stringify(probe.headers)}`));
  }

  // -- 2. pull the history -------------------------------------------------
  heading(2, "Fetching activities");

  const all: RawActivity[] = [];
  let capped = false;
  let lastHeaders: Record<string, string> = {};

  for (let page = 1; page <= maxPages; page++) {
    const res = await get(`/activity?page=${page}&itemsPerPage=${PER_PAGE}&order%5Bid%5D=desc`);
    if (res.status !== 200) {
      console.log(yellow(`  page ${page} -> HTTP ${res.status}, stopping`));
      console.log(dim(`  ${JSON.stringify(res.body).slice(0, 200)}`));
      break;
    }
    const chunk = Array.isArray(res.body) ? (res.body as RawActivity[]) : [];
    lastHeaders = { ...lastHeaders, ...res.headers };
    all.push(...chunk);
    process.stdout.write(`\r  page ${page}: +${chunk.length}  (total ${all.length})   `);
    if (chunk.length < PER_PAGE) break;
    if (page === maxPages) capped = true;
  }
  console.log();

  if (capped) console.log(yellow(`  Stopped at the ${maxPages} page cap — rerun with --max-pages to go further.`));
  if (Object.keys(lastHeaders).length) console.log(dim(`  pagination/rate headers seen: ${JSON.stringify(lastHeaders)}`));
  if (all.length === 0) {
    console.log(red("\n  The account returned zero activities. Nothing further to analyse."));
    process.exit(3);
  }

  // -- 3. distance unit ----------------------------------------------------
  heading(3, "Unit of `distance`  (a factor-1000 error corrupts every goal)");

  const unit = inferDistanceUnit(all);
  const unitColour = unit.verdict === "km" ? green : unit.verdict === "m" ? yellow : red;
  console.log(`  verdict: ${unitColour(unit.verdict.toUpperCase())}`);
  console.log(dim(`  ${unit.detail}`));
  console.log(
    unit.verdict === "km"
      ? "  -> the mapper can use `distance` as km directly"
      : unit.verdict === "m"
        ? "  -> the mapper must divide by 1000, like the Strava one does"
        : "  -> inconclusive; check a known activity by hand before writing the mapper"
  );

  const toKm = (d: number) => (unit.verdict === "m" ? d / 1000 : d);

  // -- 4. date and timezone ------------------------------------------------
  heading(4, "`date_time` and `timezone_offset`");

  const time = inferTimeSemantics(all);
  if (!time) {
    console.log(red("  no parseable date_time found"));
  } else {
    console.log(`  sample values      : ${time.sampleValues.join("  |  ")}`);
    console.log(`  parses as a Date   : ${time.parseable ? green("yes") : red("no")}`);
    console.log(`  distinct offsets   : ${JSON.stringify(time.distinctOffsets)}`);
    console.log(
      `  daytime starts     : raw ${pct(time.daytimeRaw, time.total)} vs with offset ${pct(time.daytimeWithOffset, time.total)}`
    );
    console.log(`  ${b("conclusion")}: ${time.conclusion}`);
  }
  const addOffset = !!time && time.daytimeWithOffset > time.daytimeRaw;

  // -- 5. sports inventory -------------------------------------------------
  heading(5, "Sport ids used by THIS account  (there is no endpoint to list them)");

  const sports = new Map<string, { id: unknown; name: string; count: number; km: number }>();
  for (const a of all) {
    const s = (a.sport ?? {}) as { id?: unknown; name?: string };
    const id = s.id ?? a.sport_id ?? "?";
    const key = String(id);
    const entry = sports.get(key) ?? { id, name: s.name ?? "(unnamed)", count: 0, km: 0 };
    entry.count += 1;
    entry.km += toKm((a.distance as number) ?? 0);
    sports.set(key, entry);
  }
  table(
    [...sports.values()]
      .sort((x, y) => y.count - x.count)
      .map((s) => ({ sport_id: String(s.id), name: s.name, activities: s.count, km: s.km.toFixed(0) }))
  );
  console.log(dim("\n  Map these ids to run / ride / swim in the provider's sportMapping."));
  console.log(dim("  Names are user editable and localised — prefer the id as the key."));

  // -- 6. field coverage ---------------------------------------------------
  heading(6, "Coverage of the fields the app maps");

  const fields = ["id", "sport", "date_time", "timezone_offset", "title", "distance", "duration",
    "elapsed_time", "elevation_up", "elevation_up_file", "elevation_source", "source"];
  table(
    fields.map((f) => {
      const present = all.filter((a) => a[f] !== undefined && a[f] !== null).length;
      return { field: f, present: `${present}/${all.length}`, coverage: pct(present, all.length) };
    })
  );
  const untitled = all.filter((a) => !a.title).length;
  if (untitled > 0) console.log(yellow(`\n  ${untitled} activities have no title — Activity.name needs a fallback.`));

  const sources = new Map<string, number>();
  for (const a of all) sources.set(String(a.source ?? "?"), (sources.get(String(a.source ?? "?")) ?? 0) + 1);
  console.log(`\n  import sources: ${[...sources.entries()].map(([k, v]) => `${k}=${v}`).join("  ")}`);

  // -- 7. elevation: corrected vs as recorded ------------------------------
  heading(7, "Elevation — Runalyze's value vs what the device recorded");

  const srcCount = new Map<string, number>();
  for (const a of all) srcCount.set(String(a.elevation_source ?? "?"), (srcCount.get(String(a.elevation_source ?? "?")) ?? 0) + 1);
  console.log(`  elevation_source: ${[...srcCount.entries()].map(([k, v]) => `${k}=${v}`).join("  ")}`);

  const bothElev = all.filter(
    (a) => typeof a.elevation_up === "number" && typeof a.elevation_up_file === "number" && (a.elevation_up_file as number) > 0
  );

  if (bothElev.length === 0) {
    console.log(dim("  elevation_up_file is not populated — no comparison possible"));
  } else {
    const sumUsed = bothElev.reduce((t, a) => t + (a.elevation_up as number), 0);
    const sumFile = bothElev.reduce((t, a) => t + (a.elevation_up_file as number), 0);
    const differing = bothElev.filter((a) => a.elevation_up !== a.elevation_up_file).length;

    const deltas = bothElev
      .map((a) => ((a.elevation_up as number) - (a.elevation_up_file as number)) / (a.elevation_up_file as number))
      .sort((x, y) => x - y);
    const medianDelta = deltas[Math.floor(deltas.length / 2)] * 100;

    console.log(`  compared          : ${bothElev.length} activities, ${differing} differ (${pct(differing, bothElev.length)})`);
    console.log(`  total elevation_up      : ${sumUsed.toFixed(0)} m   ${dim("<- what the app would show")}`);
    console.log(`  total elevation_up_file : ${sumFile.toFixed(0)} m   ${dim("<- what your Garmin recorded")}`);
    console.log(`  median per-activity delta: ${medianDelta >= 0 ? "+" : ""}${medianDelta.toFixed(1)}%`);

    const overall = sumFile === 0 ? 0 : ((sumUsed - sumFile) / sumFile) * 100;
    const verdict = Math.abs(overall) < 2 ? green : Math.abs(overall) < 10 ? yellow : red;
    console.log(`  ${b("overall difference")}: ${verdict(`${overall >= 0 ? "+" : ""}${overall.toFixed(1)}%`)}`);
    console.log(
      dim(
        "\n  Your Strava numbers came from the same Garmin files. If this differs\n" +
        "  noticeably, your elevation goal will read differently after the switch.\n" +
        "  The mapper can use elevation_up_file instead to stay closer to Strava."
      )
    );
  }

  // -- 8. history per year and sport --------------------------------------
  heading(8, "History per year — compare these against your cached Strava numbers");

  type Bucket = { count: number; km: number; elev: number; elevFile: number };
  const byYear = new Map<string, Bucket>();
  let undated = 0;

  for (const a of all) {
    const d = localDate(a, addOffset);
    if (!d) {
      undated++;
      continue;
    }
    const sportName = ((a.sport ?? {}) as { name?: string }).name ?? String(a.sport_id ?? "?");
    const key = `${d.getUTCFullYear()}|${sportName}`;
    const bucket = byYear.get(key) ?? { count: 0, km: 0, elev: 0, elevFile: 0 };
    bucket.count += 1;
    bucket.km += toKm((a.distance as number) ?? 0);
    bucket.elev += ((a.elevation_up as number) ?? 0);
    bucket.elevFile += ((a.elevation_up_file as number) ?? (a.elevation_up as number) ?? 0);
    byYear.set(key, bucket);
  }

  table(
    [...byYear.entries()]
      .sort((x, y) => (x[0] < y[0] ? 1 : -1))
      .map(([key, v]) => {
        const [year, sport] = key.split("|");
        return {
          year,
          sport,
          activities: v.count,
          km: v.km.toFixed(1),
          elev_runalyze: v.elev.toFixed(0),
          elev_device: v.elevFile.toFixed(0),
        };
      })
  );
  if (undated) console.log(yellow(`  ${undated} activities had no usable date`));

  // -- 9. duplicates -------------------------------------------------------
  heading(9, "Possible duplicates  (Garmin imported twice, e.g. directly and via an older Strava sync)");

  const seen = new Map<string, RawActivity[]>();
  for (const a of all) {
    const d = localDate(a, addOffset);
    if (!d) continue;
    const key = [
      d.toISOString().slice(0, 10),
      ((a.sport ?? {}) as { id?: unknown }).id ?? a.sport_id,
      toKm((a.distance as number) ?? 0).toFixed(1),
    ].join("|");
    seen.set(key, [...(seen.get(key) ?? []), a]);
  }
  const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);

  if (dupes.length === 0) {
    console.log(green("  none found (same day, same sport, same distance to 100 m)"));
  } else {
    console.log(yellow(`  ${dupes.length} suspicious group(s) — these would double-count in your yearly goals:`));
    table(
      dupes.slice(0, 15).map(([key, v]) => {
        const [date, sport, km] = key.split("|");
        return { date, sport_id: sport, km, copies: v.length, ids: v.map((x) => x.id).join(","), sources: v.map((x) => x.source).join(",") };
      })
    );
    if (dupes.length > 15) console.log(dim(`  ... and ${dupes.length - 15} more`));
  }

  // -- 10. bonus: precomputed statistics ------------------------------------
  heading(10, "Bonus: /statistics/current");

  const stats = await get("/statistics/current");
  if (stats.status === 200 && stats.body && typeof stats.body === "object") {
    const s = stats.body as Record<string, unknown>;
    console.log(green("  available") + dim(" — Runalyze computes these; the app currently approximates some of them"));
    for (const k of ["effectiveVO2max", "fitness", "fatigue", "performance", "acuteChronicWorkloadRatio", "marathonShape"]) {
      if (s[k] !== undefined) console.log(`    ${k.padEnd(28)} ${s[k]}`);
    }
  } else {
    console.log(yellow(`  HTTP ${stats.status} — not available with this token/plan`));
  }

  // -- artifacts -----------------------------------------------------------
  mkdirSync(OUT_DIR, { recursive: true });
  const rawPath = join(OUT_DIR, "activities-sample.json");
  const summaryPath = join(OUT_DIR, "summary.json");

  writeFileSync(rawPath, JSON.stringify(all.slice(0, 25), null, 2));
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        fetchedCount: all.length,
        capped,
        distanceUnit: unit,
        time,
        addOffsetForLocalTime: addOffset,
        sports: [...sports.values()],
        sources: Object.fromEntries(sources),
        perYear: Object.fromEntries(byYear),
        duplicateGroups: dupes.length,
        headers: lastHeaders,
      },
      null,
      2
    )
  );

  heading(11, "Written");
  console.log(`  ${rawPath}     ${dim("25 raw activities — use as test fixtures for the mapper")}`);
  console.log(`  ${summaryPath}          ${dim("machine readable findings")}`);
  console.log(yellow(`\n  Both contain your activity data. ${OUT_DIR}/ is gitignored.\n`));
}

main().catch((e) => {
  console.error(red("\nSpike failed:"), e instanceof Error ? e.message : e);
  process.exit(1);
});
