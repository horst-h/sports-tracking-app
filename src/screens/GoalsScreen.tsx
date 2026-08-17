import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GoalMetric, Sport } from "../domain/metrics/types";
import { applyGoalEdits, NO_GOAL_EDITS, withGoalEdit, type GoalEdits } from "./goalEdits";
import { useGoals } from "../hooks/useGoals";
import { useActivities } from "../hooks/useActivities";
import { useDataAccess } from "../hooks/useDataAccess";
import * as goalsRepo from "../repositories/goalsRepository";
import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import { buildUiAthleteStats, type UiAthleteStats } from "../domain/metrics/uiStats";
import GoalField from "../components/GoalField";
import GoalsCentralAiCoach from "../components/GoalsCentralAiCoach";
import RunningIcon from "../components/icons/RunningIcon";
import CyclingIcon from "../components/icons/CyclingIcon";
import SwimmingIcon from "../components/icons/SwimmingIcon";

const GOAL_FIELDS: Array<{
  key: GoalMetric;
  label: string;
  unit: string;
  helpText?: string;
  allowDecimal: boolean;
  excludeSports?: Sport[]; // Sports for which this metric is not applicable
}> = [
  {
    key: "distanceKm",
    label: "Distance",
    unit: "km",
    helpText: "Total kilometers you want to cover this year",
    allowDecimal: true,
  },
  {
    key: "count",
    label: "Activities",
    unit: "activities",
    helpText: "Number of workouts you want to complete",
    allowDecimal: false,
  },
  {
    key: "elevationM",
    label: "Elevation",
    unit: "m",
    helpText: "Total meters of elevation gain for the year",
    allowDecimal: true,
    excludeSports: ["swim"], // Elevation is not tracked for swimming
  },
];

export default function GoalsScreen() {
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const { ready } = useDataAccess();
  
  const [selectedSport, setSelectedSport] = useState<Sport>("run");
  
  const { goals, loading: goalsLoading } = useGoals(year, ready);
  const { activities, loading: activitiesLoading } = useActivities(year, ready);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  /** A save that only reached this device. Worth saying out loud — silence here
   *  reads as "saved everywhere" and is how two devices drift apart unnoticed. */
  const [savedLocallyOnly, setSavedLocallyOnly] = useState(false);
  const [edits, setEdits] = useState<GoalEdits>(NO_GOAL_EDITS);

  /**
   * What the athlete is actually looking at: the loaded goals with this
   * session's edits merged in. Everything on this screen reads from here, and
   * so does every save — a save built from `goals` alone would be built from a
   * snapshot taken before the last three fields were filled in.
   */
  const editedGoals = useMemo(
    () => applyGoalEdits(goals, edits, year),
    [goals, edits, year]
  );

  const currentGoals = useMemo<Partial<Record<GoalMetric, number>>>(
    () => editedGoals.perSport?.[selectedSport] ?? {},
    [editedGoals, selectedSport]
  );

  const statsBySport = useMemo((): Record<Sport, UiAthleteStats> | null => {
    if (!activities || !ready) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    const normalized = normalizeActivities(activities);

    function buildForSport(s: Sport) {
      const agg = aggregateYear(normalized, year, s, asOfLocalIso);
      // The edited goals, so progress and the coach react to a number the
      // moment it is entered rather than after the next reload.
      const sportGoals = editedGoals.perSport?.[s];
      return buildUiAthleteStats({
        aggregate: agg,
        asOfDateLocal: asOfLocalIso,
        retrievedAtLocal,
        goals: sportGoals,
        mode: "ytd",
        blendWeightRolling: 0.6,
      });
    }

    return {
      run: buildForSport("run"),
      ride: buildForSport("ride"),
      swim: buildForSport("swim"),
    };
  }, [activities, editedGoals, year, ready]);

  const otherSport: Sport = selectedSport === "run" ? "ride" : "run";
  const stats = statsBySport ? statsBySport[selectedSport] : null;
  const otherStats = statsBySport ? statsBySport[otherSport] : null;

  async function saveGoalField(metric: GoalMetric, value: number | undefined) {
    // Recorded before the save, not after it. The edit is what the next save
    // has to build on, and awaiting a round trip first is how two fields filled
    // in quick succession both start from the same stale base.
    const nextEdits = withGoalEdit(edits, selectedSport, metric, value);
    setEdits(nextEdits);

    const payload = applyGoalEdits(goals, nextEdits, year);

    const savePromise = goalsRepo.saveGoals(year, payload);
    const tracked = savePromise.then(() => {});
    pendingSaveRef.current = tracked;
    const result = await savePromise;
    if (pendingSaveRef.current === tracked) {
      pendingSaveRef.current = null;
    }

    setSavedLocallyOnly(!result.synced);
  }

  async function handleBack() {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof (active as { blur?: () => void }).blur === "function") {
      (active as { blur: () => void }).blur();
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    if (pendingSaveRef.current) {
      await pendingSaveRef.current;
    }
    navigate("/");
  }

  const isLoading = goalsLoading || activitiesLoading;

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "var(--bg)",
          paddingBottom: "var(--space-3)",
          marginBottom: "var(--space-4)",
        }}
      >
        <button
          onClick={handleBack}
          className="nav-back"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <h1 className="goals-title">
          Goals
          <span className="goals-title__year">{year}</span>
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Set and manage your yearly targets
        </p>

        {savedLocallyOnly && (
          <p role="status" className="notice-warning" style={{ marginTop: "0.5rem" }}>
            Saved on this device only — not synced yet. It will be sent the next time
            the app can reach the server while you are signed in.
          </p>
        )}

        {/* Sport tabs */}
        <div className="history-tabs" style={{ marginTop: "var(--space-4)" }}>
          <button
            type="button"
            className={`history-tab${selectedSport === "run" ? " history-tab--active" : ""}`}
            onClick={() => setSelectedSport("run")}
            aria-pressed={selectedSport === "run"}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", padding: "8px 18px" }}
          >
            <span style={{ width: "18px", height: "18px", display: "flex" }}>
              <RunningIcon />
            </span>
            <span>Running</span>
          </button>
          <button
            type="button"
            className={`history-tab${selectedSport === "ride" ? " history-tab--active" : ""}`}
            onClick={() => setSelectedSport("ride")}
            aria-pressed={selectedSport === "ride"}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", padding: "8px 18px" }}
          >
            <span style={{ width: "18px", height: "18px", display: "flex" }}>
              <CyclingIcon />
            </span>
            <span>Cycling</span>
          </button>
          <button
            type="button"
            className={`history-tab${selectedSport === "swim" ? " history-tab--active" : ""}`}
            onClick={() => setSelectedSport("swim")}
            aria-pressed={selectedSport === "swim"}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", padding: "8px 18px" }}
          >
            <span style={{ width: "18px", height: "18px", display: "flex" }}>
              <SwimmingIcon />
            </span>
            <span>Swimming</span>
          </button>
        </div>
      </div>

      {/* Central AI Coach */}
      {!isLoading && stats && (
        <GoalsCentralAiCoach
          sport={selectedSport}
          year={year}
          stats={stats}
          otherStats={otherStats || undefined}
          currentGoals={currentGoals}
        />
      )}

      {isLoading && (
        <p style={{ marginTop: "1.5rem", color: "var(--text-muted)" }}>Loading...</p>
      )}

      {!isLoading && (
        <div className="goals-grid">
          {GOAL_FIELDS.map((field) => {
            // Skip this field if it's excluded for the current sport
            if (field.excludeSports?.includes(selectedSport)) {
              return null;
            }

            const currentValue = currentGoals[field.key];

            return (
              <section key={field.key} className="card card--primary">
                <header className="card__header card__header--solo">
                  <div>
                    <div className="card__kicker">{field.label} Goal</div>
                  </div>
                </header>
                <div className="card__body">
                  <GoalField
                    label={field.label}
                    value={currentValue}
                    unit={field.unit}
                    helpText={field.helpText}
                    allowDecimal={field.allowDecimal}
                    onSave={(value) => saveGoalField(field.key, value)}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
