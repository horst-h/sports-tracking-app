import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Sport } from "../domain/metrics/types";
import type { UiAthleteStats } from "../domain/metrics/uiStats";
import {
  getMultiCategoryGoalCoachFeedback,
  type MultiCategoryCoachInput,
  type MultiCategoryCoachResult,
} from "../domain/coach/goalCoach";
import { formatNumber } from "../utils/format";

type Props = {
  sport: Sport;
  year: number;
  stats: UiAthleteStats;
  otherStats?: UiAthleteStats;
  currentGoals: {
    distanceKm?: number;
    count?: number;
    elevationM?: number;
  };
};

export default function GoalsCentralAiCoach({ sport, year, stats, otherStats, currentGoals }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [result, setResult] = useState<MultiCategoryCoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI Coach currently only supports run/ride
  if (sport === "swim") {
    return null;
  }

  // Type assertion: we've confirmed sport is "run" or "ride"
  const sportForAi = sport as "run" | "ride";
  const otherSport = sportForAi === "run" ? "ride" : "run";
  const sportLabel = sportForAi === "run" ? "running" : "cycling";

  async function handleAnalyze() {
    setStatus("loading");
    setError(null);

    const input: MultiCategoryCoachInput = {
      year,
      sport: sportForAi,
      remainingWeeks: stats.weeksLeftExact,
      categories: {
        distanceKm: {
          goalValue: currentGoals.distanceKm ?? null,
          ytd: stats.progress.distanceKm.ytd,
          trendPerWeek: stats.progress.distanceKm.avgPerWeek,
          yearEndForecast: stats.progress.distanceKm.forecast,
        },
        count: {
          goalValue: currentGoals.count ?? null,
          ytd: stats.progress.count.ytd,
          trendPerWeek: stats.progress.count.avgPerWeek,
          yearEndForecast: stats.progress.count.forecast,
        },
        elevationM: {
          goalValue: currentGoals.elevationM ?? null,
          ytd: stats.progress.elevationM.ytd,
          trendPerWeek: stats.progress.elevationM.avgPerWeek,
          yearEndForecast: stats.progress.elevationM.forecast,
        },
      },
      otherSport: otherStats
        ? {
            sport: otherSport,
            summary: `${otherStats.progress.distanceKm.ytd.toFixed(0)} km YTD, trending ${otherStats.progress.distanceKm.avgPerWeek.toFixed(1)} km/week`,
          }
        : undefined,
    };

    try {
      const coachResult = await getMultiCategoryGoalCoachFeedback(input);
      setResult(coachResult);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI coach error");
      setStatus("error");
    }
  }

  return (
    <div style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-4)" }}>
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={status === "loading"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 24px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          fontWeight: 600,
          fontSize: "15px",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          opacity: status === "loading" ? 0.7 : 1,
          transition: "all 0.2s",
          width: "100%",
        }}
      >
        <Sparkles size={18} />
        {status === "loading" ? "Analyzing goals..." : "AI Coach – Analyze & Suggest"}
      </button>

      {status === "error" && (
        <div
          style={{
            marginTop: "var(--space-3)",
            padding: "var(--space-3)",
            borderRadius: "8px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          <div style={{ color: "var(--text)", marginBottom: "8px", fontWeight: 500 }}>
            {error || "AI coach failed. Please try again."}
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {status === "ready" && result && (
        <div
          style={{
            marginTop: "var(--space-3)",
            padding: "var(--space-4)",
            borderRadius: "8px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ marginBottom: "var(--space-3)" }}>
            <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "8px" }}>
              AI Coach Analysis – {sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1)} {year}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
              {result.summary}
            </div>
          </div>

          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {/* Distance */}
            <CategoryResult
              label="Distance"
              unit="km"
              category={result.categories.distanceKm}
              allowDecimal
            />

            {/* Activities */}
            <CategoryResult
              label="Activities"
              unit="activities"
              category={result.categories.count}
              allowDecimal={false}
            />

            {/* Elevation */}
            <CategoryResult
              label="Elevation"
              unit="m"
              category={result.categories.elevationM}
              allowDecimal
            />
          </div>

          {result.crossSportNote && (
            <div
              style={{
                marginTop: "var(--space-3)",
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--border)",
                fontSize: "14px",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              {result.crossSportNote}
            </div>
          )}

          <button
            type="button"
            onClick={handleAnalyze}
            style={{
              marginTop: "var(--space-3)",
              padding: "6px 12px",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              color: "var(--text-muted)",
            }}
          >
            Re-run analysis
          </button>
        </div>
      )}
    </div>
  );
}

type CategoryResultProps = {
  label: string;
  unit: string;
  category: {
    status: "set" | "missing";
    feedback: string;
    suggestion: number | null;
  };
  allowDecimal: boolean;
};

function CategoryResult({ label, unit, category, allowDecimal }: CategoryResultProps) {
  return (
    <div
      style={{
        padding: "var(--space-3)",
        borderRadius: "6px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ fontWeight: 600, fontSize: "15px" }}>{label}</div>
        {category.status === "missing" && category.suggestion !== null && (
          <div
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Suggested: {formatNumber(category.suggestion, { maximumFractionDigits: allowDecimal ? 1 : 0 })} {unit}
          </div>
        )}
      </div>
      <div style={{ fontSize: "14px", color: "var(--text)", lineHeight: "1.5" }}>
        {category.feedback}
      </div>
    </div>
  );
}
