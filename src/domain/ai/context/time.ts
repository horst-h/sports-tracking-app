import type { AiTimeContext } from "../contracts/aiContext";

export function getTimeContext(today: Date): AiTimeContext {
  const year = today.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const daysLeftInYear = Math.max(
    0,
    Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );

  // simple ISO-ish week number (good enough for app logic)
  const dayMs = 1000 * 60 * 60 * 24;
  const day = Math.floor((today.getTime() - start.getTime()) / dayMs) + 1;
  const weekOfYear = Math.ceil(day / 7);

  const weeksLeftInYear = Math.max(0, 52 - weekOfYear + 1);

  return {
    todayISO: today.toISOString().slice(0, 10),
    year,
    weekOfYear,
    weeksLeftInYear,
    daysLeftInYear,
  };
}
