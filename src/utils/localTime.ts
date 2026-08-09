function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formats an instant as local wall-clock time in the shape
 * Activity.startDateLocal expects: ISO 8601 without a zone suffix.
 */
export function toLocalWallClock(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Removes a trailing "Z" or numeric UTC offset. Strava appends "Z" to
 * start_date_local even though the value is local time, not UTC.
 */
export function stripZoneSuffix(iso: string): string {
  return iso.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "");
}
