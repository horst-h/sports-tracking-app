export type Sport = "run" | "ride";

export interface StravaActivityLike {
  id: number | string;
  type: string;                // e.g. "Run", "Ride"
  start_date_local: string;    // ISO string
  distance: number;            // meters
  total_elevation_gain: number;// meters
  moving_time: number;         // seconds
  elapsed_time?: number;       // seconds
  workout_type?: number | null;
  commute?: boolean;
  trainer?: boolean;           // indoor
}

export interface NormalizedActivity {
  id: string;
  sport: Sport;
  startDateLocal: string;      // ISO
  year: number;
  month: number;               // 1..12
  dayOfYear: number;           // 1..366
  distanceKm: number;
  elevationM: number;
  movingTimeSec: number;
  isCommute: boolean;
  isIndoor: boolean;
}

export type GoalMetric = "count" | "distanceKm" | "elevationM";

export interface YearGoals {
  year: number;
  perSport: Record<Sport, Partial<Record<GoalMetric, number>>>;
}

export interface MetricTotals {
  count: number;
  distanceKm: number;
  elevationM: number;
  movingTimeHours: number;
}

export interface BucketSeries {
  // Index 1..12 used; 0 stays 0 for convenience
  months: number[];
}

export interface AggregateYear {
  year: number;
  sport: Sport;
  totals: MetricTotals;
  byMonth: {
    count: BucketSeries;
    distanceKm: BucketSeries;
    elevationM: BucketSeries;
    movingTimeHours: BucketSeries;
  };
  rolling: {
    last7: MetricTotals;
    last28: MetricTotals;
  };
  lastActivityDateLocal?: string;
}

export interface ForecastMetric {
  goal?: number;
  ytd: number;
  percent?: number;            // 0..1
  projectedYearEnd: number;
  requiredPerWeek: number;     // from now to Dec 31
  onTrack: boolean;
}

export interface Forecast {
  year: number;
  sport: Sport;
  asOfDateLocal: string;
  count: ForecastMetric;
  distanceKm: ForecastMetric;
  elevationM: ForecastMetric;
}

export interface DashboardModel {
  year: number;
  generatedAtLocal: string;
  sports: Record<Sport, {
    aggregate: AggregateYear;
    forecast: Forecast;
    insights: string[];
  }>;
}
