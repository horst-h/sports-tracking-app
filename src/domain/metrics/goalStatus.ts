export type GoalStatus = "on-track" | "catch-up" | "off-track";

export type GoalStatusStyles = {
  pillClass: string;
  barClass: string;
};

export type ForecastBadgeColor = "on-track" | "warning" | "danger";

export function getForecastBadgeStyles(badgeColor: ForecastBadgeColor): string {
  switch (badgeColor) {
    case "warning":
      return "bg-amber-100 text-amber-700 border-amber-300";
    case "danger":
      return "bg-rose-100 text-rose-700 border-rose-300";
    case "on-track":
    default:
      return "bg-emerald-100 text-emerald-700 border-emerald-300";
  }
}

export function calculateGoalStatus(currentRate: number, requiredRate: number): GoalStatus {
  const safeCurrent = Number.isFinite(currentRate) ? currentRate : 0;
  const safeRequired = Number.isFinite(requiredRate) ? requiredRate : 0;

  if (safeRequired <= 0) return "on-track";
  if (safeCurrent <= 0) return "off-track";
  if (safeCurrent >= safeRequired) return "on-track";
  if (safeRequired <= safeCurrent * 1.2) return "catch-up";
  return "off-track";
}

export function getStatusStyles(status: GoalStatus): GoalStatusStyles {
  switch (status) {
    case "on-track":
      return {
        pillClass: "bg-emerald-100 text-emerald-700 border-emerald-300",
        barClass: "bg-emerald-500",
      };
    case "catch-up":
      return {
        pillClass: "bg-amber-100 text-amber-700 border-amber-300",
        barClass: "bg-amber-500",
      };
    case "off-track":
      return {
        pillClass: "bg-rose-100 text-rose-700 border-rose-300",
        barClass: "bg-rose-500",
      };
    default:
      return { pillClass: "", barClass: "" };
  }
}
