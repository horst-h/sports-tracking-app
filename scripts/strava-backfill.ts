/**
 * Backfills the activities that exist in a Strava bulk export but not in
 * Runalyze.
 *
 * Runalyze's history starts where the Garmin connection was switched on; the
 * Strava export reaches further back. This script uploads only the difference,
 * so re-running it is safe and adds nothing twice.
 *
 * Two facts it relies on, both measured against the live account rather than
 * assumed (see scripts/runalyze-spike.ts for the read side):
 *
 *   - Runalyze's write endpoint is POST /api/v1/activities/uploads, multipart
 *     `file`, authenticated with the same `token` header as the read API. It
 *     is not part of the documented Hydra schema; Runalyze's own
 *     upload-activities.sh is the reference.
 *   - `Aktivitätsdatum` in the Strava CSV is UTC, not local time. Read as
 *     local it matches nothing. The script re-checks this at runtime and
 *     warns rather than silently importing 500 duplicates.
 *
 * DRY RUN BY DEFAULT. Nothing is uploaded without --apply.
 *
 * Usage:
 *   npm run backfill:strava -- --export "/path/to/Strava_export"
 *   npm run backfill:strava -- --export "..." --apply
 *   npm run backfill:strava -- --export "..." --apply --limit 5
 *   npm run backfill:strava -- --export "..." --year 2019
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { basename, join } from "node:path";

if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* a malformed .env should not stop the run */
  }
}

const BASE = "https://runalyze.com/api/v1";
const UPLOAD_URL = `${BASE}/activities/uploads`;
const LEDGER_DIR = "spike-output";
const LEDGER = join(LEDGER_DIR, "strava-backfill.jsonl");

/** Gap allowed between two start times before they count as different runs. */
const START_TOLERANCE_SEC = 180;
/** Second chance for the same session: same day, near-identical distance. */
const DISTANCE_TOLERANCE_REL = 0.02;
const DISTANCE_TOLERANCE_MIN_KM = 0.05;
/** Pause between uploads. Runalyze publishes no rate limit; this is courtesy. */
const UPLOAD_DELAY_MS = 2000;

// ---------------------------------------------------------------- utilities

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function heading(title: string) {
  console.log(`\n${b(title)}\n${"─".repeat(64)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------------------- CSV parsing

/**
 * Strava's activities.csv carries free-text activity descriptions, which
 * contain commas, quotes and newlines. Splitting on commas loses rows; this
 * is a real RFC 4180 reader.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Column headers are localised to the account's Strava language, so they are
 * looked up by alias rather than by a fixed name. Position is not reliable
 * either — Strava has added columns between exports.
 */
const COLUMNS = {
  date: ["Aktivitätsdatum", "Activity Date"],
  name: ["Name der Aktivität", "Activity Name"],
  type: ["Aktivitätsart", "Activity Type"],
  distance: ["Distanz", "Distance"],
  filename: ["Dateiname", "Filename"],
} as const;

type ColumnKey = keyof typeof COLUMNS;

/**
 * `Distanz` appears twice in the export, and the two are not the same number:
 * the early one is the display value, rounded to two decimals and written
 * with the locale's decimal comma ("13,62"); the later one is the raw metre
 * value ("13624.2"). Taking the last occurrence gets the precise one — and
 * parseDistance below copes if a future export flips that around.
 */
function locateColumns(header: string[]): Record<ColumnKey, number> {
  // The export is written with a BOM, which otherwise sticks to the first header.
  const normalised = header.map((h) => h.replace(/^\uFEFF/, "").trim());
  const found = {} as Record<ColumnKey, number>;

  for (const [key, aliases] of Object.entries(COLUMNS) as [ColumnKey, readonly string[]][]) {
    const matches = normalised.flatMap((h, i) => (aliases.includes(h) ? [i] : []));
    if (matches.length === 0) {
      console.error(red(`\nColumn not found in activities.csv: ${aliases.join(" / ")}`));
      console.error(dim(`Header was: ${normalised.slice(0, 20).join(" | ")}`));
      process.exit(1);
    }
    found[key] = key === "distance" ? matches[matches.length - 1] : matches[0];
  }
  return found;
}

/** Reads both "13624.2" and the locale-formatted "13,62". */
function parseDistance(value: string): number {
  const v = value.trim();
  if (!v) return 0;
  return parseFloat(v.includes(",") && !v.includes(".") ? v.replace(",", ".") : v) || 0;
}

/**
 * Reads "19.07.2026, 08:45:30" as an instant.
 *
 * The value is UTC — verified against the overlapping years, where reading it
 * as UTC matches 452 of 548 activities and every other reading matches
 * essentially none.
 */
const GERMAN_DATE = /^(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})$/;

function parseStravaDate(value: string): Date {
  const m = GERMAN_DATE.exec(value.trim());
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }

  // Other locales render the date differently; let the platform try, and read
  // the result as UTC to stay consistent with the branch above.
  const fallback = new Date(`${value.trim()} UTC`);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  throw new Error(`Unrecognised activity date: ${value}`);
}

// ------------------------------------------------------------- Strava export

type StravaActivity = {
  startUtc: Date;
  name: string;
  type: string;
  distanceKm: number;
  file: string;
};

function readExport(dir: string): StravaActivity[] {
  const csvPath = join(dir, "activities.csv");
  if (!existsSync(csvPath)) {
    console.error(red(`\nNo activities.csv in ${dir}`));
    console.error("Point --export at the unzipped Strava bulk export folder.\n");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const col = locateColumns(rows[0]);

  const raw = rows.slice(1).flatMap((row) => {
    if (row.length <= col.filename) return [];
    // Activities entered by hand on Strava have no file. The Runalyze API can
    // only ingest files, so they are reported separately rather than skipped
    // silently.
    return [
      {
        startUtc: parseStravaDate(row[col.date]),
        name: row[col.name],
        type: row[col.type],
        distance: parseDistance(row[col.distance]),
        file: row[col.filename].trim(),
      },
    ];
  });

  // Whether that column holds metres or kilometres is not stated anywhere, and
  // the difference is a factor of 1000 in the duplicate check. Decide it from
  // the data: a median session is single-digit to low-double-digit kilometres.
  const positive = raw.map((a) => a.distance).filter((d) => d > 0).sort((a, b) => a - b);
  const median = positive[Math.floor(positive.length / 2)] ?? 0;
  const divisor = median > 200 ? 1000 : 1;

  return raw.map((a) => ({ ...a, distanceKm: a.distance / divisor }));
}

// ----------------------------------------------------------------- Runalyze

type RunalyzeActivity = { date_time: string; distance?: number | null };

async function fetchRunalyze(token: string): Promise<RunalyzeActivity[]> {
  const all: RunalyzeActivity[] = [];
  for (let page = 1; page <= 100; page++) {
    const url = `${BASE}/activity?page=${page}&itemsPerPage=200&order%5Bid%5D=desc`;
    const res = await fetch(url, { headers: { token, accept: "application/json" } });

    if (!res.ok) {
      console.error(red(`\nRunalyze answered ${res.status} while listing activities.`));
      console.error(dim((await res.text()).slice(0, 200)));
      process.exit(1);
    }

    const batch = (await res.json()) as RunalyzeActivity[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    process.stdout.write(dim(`\r  fetched ${all.length} activities`));
  }
  process.stdout.write("\n");
  return all;
}

// ----------------------------------------------------------------- matching

type Known = { instant: number; day: string; distanceKm: number };

function index(activities: RunalyzeActivity[]): Known[] {
  return activities.map((a) => {
    const d = new Date(a.date_time);
    return {
      instant: d.getTime(),
      day: d.toISOString().slice(0, 10),
      distanceKm: a.distance ?? 0,
    };
  });
}

/**
 * Same session or not.
 *
 * Start time alone is not enough: for a handful of activities Strava and
 * Runalyze disagree by up to an hour — those came into Strava as GPX, whose
 * first trackpoint is not where the recording began. Identical distance on
 * the same day settles those without letting genuinely different sessions
 * collapse into one.
 */
function alreadyInRunalyze(s: StravaActivity, known: Known[]): boolean {
  const instant = s.startUtc.getTime();
  const day = s.startUtc.toISOString().slice(0, 10);
  const tolerance = Math.max(DISTANCE_TOLERANCE_MIN_KM, s.distanceKm * DISTANCE_TOLERANCE_REL);

  return known.some(
    (k) =>
      Math.abs(k.instant - instant) < START_TOLERANCE_SEC * 1000 ||
      (k.day === day && s.distanceKm > 0 && Math.abs(k.distanceKm - s.distanceKm) <= tolerance)
  );
}

/**
 * Guards the UTC assumption behind parseStravaDate.
 *
 * If the export ever ships local timestamps instead, every activity looks
 * missing and a blind --apply would import the entire history a second time.
 * Comparing the match count against shifted readings catches that before any
 * upload happens.
 */
function checkTimeBase(strava: StravaActivity[], known: Known[]): void {
  const matchesAt = (shiftHours: number) =>
    strava.filter((s) => {
      const shifted = s.startUtc.getTime() - shiftHours * 3600_000;
      return known.some((k) => Math.abs(k.instant - shifted) < START_TOLERANCE_SEC * 1000);
    }).length;

  const asUtc = matchesAt(0);
  const shifted = [1, 2, -1, -2].map((h) => ({ h, n: matchesAt(h) }));
  const best = shifted.reduce((a, c) => (c.n > a.n ? c : a));

  if (best.n > asUtc) {
    console.log(
      yellow(
        `\n  ⚠ Reading the CSV as UTC matches ${asUtc} activities, but shifting it ` +
          `by ${best.h}h matches ${best.n}. The export's time base has changed — ` +
          `fix parseStravaDate before uploading anything.`
      )
    );
    process.exit(1);
  }
  console.log(dim(`  time base ok — UTC matches ${asUtc}, best shifted reading ${best.n}`));
}

// ------------------------------------------------------------------ ledger

/** Files this script has already handed to Runalyze, across all runs. */
function readLedger(): Set<string> {
  if (!existsSync(LEDGER)) return new Set();
  const done = new Set<string>();
  for (const line of readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as { file: string; ok: boolean };
      if (entry.ok) done.add(entry.file);
    } catch {
      /* a truncated last line just means one file gets retried */
    }
  }
  return done;
}

function recordUpload(entry: Record<string, unknown>): void {
  mkdirSync(LEDGER_DIR, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(entry) + "\n");
}

// ------------------------------------------------------------------ uploads

async function upload(token: string, exportDir: string, relativePath: string) {
  const path = join(exportDir, relativePath);
  const raw = readFileSync(path);

  // Strava gzips the originals. Runalyze reads the format from the extension,
  // so the payload has to be unpacked and the .gz dropped from the name.
  const gzipped = relativePath.endsWith(".gz");
  const body = gzipped ? gunzipSync(raw) : raw;
  const filename = basename(gzipped ? relativePath.slice(0, -3) : relativePath);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(body)]), filename);

  const res = await fetch(UPLOAD_URL, { method: "POST", headers: { token }, body: form });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 300), filename };
}

// --------------------------------------------------------------------- main

async function main() {
  const token = process.env.RUNALYZE_API_TOKEN;
  if (!token) {
    console.error(red("\nRUNALYZE_API_TOKEN is not set.\n"));
    console.error("Create one at https://runalyze.com/settings/personal-api — this script");
    console.error("needs the WRITE scope as well as read, and put it in .env (gitignored):");
    console.error("  RUNALYZE_API_TOKEN=xxxx\n");
    process.exit(1);
  }

  const exportDir = arg("export");
  if (!exportDir) {
    console.error(red("\n--export is required.\n"));
    console.error('  npm run backfill:strava -- --export "/path/to/Strava_export"\n');
    process.exit(1);
  }

  const apply = flag("apply");
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  const onlyYear = arg("year");

  heading("1. Reading the Strava export");
  const strava = readExport(exportDir);
  console.log(`  ${strava.length} activities in activities.csv`);

  const withoutFile = strava.filter((s) => !s.file);
  if (withoutFile.length > 0) {
    console.log(
      yellow(`  ${withoutFile.length} have no file — the API only ingests files, so those stay behind`)
    );
  }

  // The CSV names the file; whether it is still there is another question.
  // `gunzip` without -k deletes the archive it read, so unpacking a few files
  // by hand is enough to leave the column pointing at nothing. Better to say
  // so here than to fail on file 40 of 94.
  const vanished = strava.filter((s) => s.file && !existsSync(join(exportDir, s.file)));
  if (vanished.length > 0) {
    console.log(yellow(`  ${vanished.length} referenced files are missing from the export:`));
    for (const s of vanished.slice(0, 5)) console.log(dim(`    ${s.file}`));
    if (vanished.length > 5) console.log(dim(`    … and ${vanished.length - 5} more`));
  }

  heading("2. Reading Runalyze");
  const known = index(await fetchRunalyze(token));
  console.log(`  ${known.length} activities on the account`);

  heading("3. Comparing");
  checkTimeBase(strava, known);

  let missing = strava.filter((s) => s.file && !alreadyInRunalyze(s, known));
  console.log(`  ${strava.length - missing.length - withoutFile.length} already there, ${b(String(missing.length))} missing`);

  const unreadable = missing.filter((s) => !existsSync(join(exportDir, s.file)));
  if (unreadable.length > 0) {
    console.log(yellow(`  ${unreadable.length} of them have no file left in the export and cannot be uploaded`));
    missing = missing.filter((s) => existsSync(join(exportDir, s.file)));
  }

  if (onlyYear) {
    missing = missing.filter((s) => String(s.startUtc.getUTCFullYear()) === onlyYear);
    console.log(dim(`  --year ${onlyYear} narrows that to ${missing.length}`));
  }

  const done = readLedger();
  const alreadyUploaded = missing.filter((s) => done.has(s.file)).length;
  if (alreadyUploaded > 0) {
    console.log(dim(`  ${alreadyUploaded} were uploaded by an earlier run and are skipped`));
    missing = missing.filter((s) => !done.has(s.file));
  }

  const perYear = new Map<number, { count: number; km: number }>();
  for (const s of missing) {
    const y = s.startUtc.getUTCFullYear();
    const e = perYear.get(y) ?? { count: 0, km: 0 };
    e.count++;
    e.km += s.distanceKm;
    perYear.set(y, e);
  }
  console.log();
  console.log(dim("  year   count      km"));
  for (const y of [...perYear.keys()].sort()) {
    const e = perYear.get(y)!;
    console.log(`  ${y}   ${String(e.count).padStart(5)}  ${e.km.toFixed(1).padStart(6)}`);
  }

  const queue = missing.slice(0, limit);

  if (!apply) {
    heading("4. Dry run — nothing was uploaded");
    for (const s of queue.slice(0, 10)) {
      console.log(
        `  ${s.startUtc.toISOString().slice(0, 16).replace("T", " ")}  ${s.type.padEnd(14)} ` +
          `${s.distanceKm.toFixed(1).padStart(6)} km  ${dim(s.file)}`
      );
    }
    if (queue.length > 10) console.log(dim(`  … and ${queue.length - 10} more`));
    console.log(`\n  Re-run with ${b("--apply")} to upload these ${queue.length} activities.\n`);
    return;
  }

  heading(`4. Uploading ${queue.length} activities`);
  let ok = 0;
  let failed = 0;

  for (const [i, s] of queue.entries()) {
    const label = `${s.startUtc.toISOString().slice(0, 10)} ${s.type} ${s.distanceKm.toFixed(1)}km`;
    process.stdout.write(`  ${String(i + 1).padStart(3)}/${queue.length}  ${label.padEnd(34)}`);

    try {
      const result = await upload(token, exportDir, s.file);
      recordUpload({ file: s.file, at: new Date().toISOString(), ...result });

      if (result.ok) {
        ok++;
        console.log(green("ok"));
      } else {
        failed++;
        console.log(red(`${result.status}`) + dim(` ${result.body}`));
      }
    } catch (e) {
      failed++;
      recordUpload({ file: s.file, at: new Date().toISOString(), ok: false, error: String(e) });
      console.log(red(`error `) + dim(String((e as Error)?.message ?? e)));
    }

    if (i < queue.length - 1) await sleep(UPLOAD_DELAY_MS);
  }

  console.log(`\n  ${green(`${ok} uploaded`)}${failed > 0 ? `, ${red(`${failed} failed`)}` : ""}`);
  console.log(
    dim(
      "\n  Runalyze processes uploads in the background — give it a few minutes,\n" +
        "  then re-run without --apply to confirm the gap is closed.\n"
    )
  );
}

main().catch((e) => {
  console.error(red(`\n${e?.stack ?? e}\n`));
  process.exit(1);
});
