import { useEffect, useMemo, useState } from "react";
import type { GoalMetric, Sport, YearGoals } from "../domain/metrics/types";
import * as goalsRepo from "../repositories/goalsRepository";

type Props = {
  year: number;
  onYearChange: (year: number) => void;
};

const METRICS: { key: GoalMetric; label: string; unit: string }[] = [
  { key: "distanceKm", label: "Distance", unit: "km" },
  { key: "count", label: "Units", unit: "#" },
  { key: "elevationM", label: "Elevation", unit: "m" },
];

const SPORTS: { key: Sport; label: string }[] = [
  { key: "run", label: "Running" },
  { key: "ride", label: "Cycling" },
];

function currentYear() {
  return new Date().getFullYear();
}

function emptyGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {} } };
}

function toNumberOrUndefined(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export default function GoalsSettingsForm({ year, onYearChange }: Props) {
  const [draft, setDraft] = useState<YearGoals>(() => emptyGoals(year));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  // Load from IndexedDB when year changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await goalsRepo.loadGoals(year);
        if (!cancelled) setDraft(loaded ?? emptyGoals(year));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [year]);

  // Small toast
  useEffect(() => {
    if (!savedHint) return;
    const t = window.setTimeout(() => setSavedHint(null), 1600);
    return () => window.clearTimeout(t);
  }, [savedHint]);

  const hasAnyValues = useMemo(() => {
    const ps = draft.perSport;
    return (
      Object.values(ps.run).some((v) => typeof v === "number") ||
      Object.values(ps.ride).some((v) => typeof v === "number")
    );
  }, [draft]);

  function setValue(sport: Sport, metric: GoalMetric, raw: string) {
    const n = toNumberOrUndefined(raw);
    setDraft((prev) => ({
      ...prev,
      year,
      perSport: {
        ...prev.perSport,
        [sport]: {
          ...prev.perSport[sport],
          [metric]: n,
        },
      },
    }));
  }

  async function onSave() {
    setLoading(true);
    setError(null);
    try {
      const payload: YearGoals = { ...draft, year };
      await goalsRepo.saveGoals(year, payload);
      setSavedHint("Saved ✅");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    setLoading(true);
    setError(null);
    try {
      await goalsRepo.deleteGoals(year);
      setDraft(emptyGoals(year));
      setSavedHint("Deleted 🗑️");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontWeight: 600, width: 70 }}>Year</label>
        <input
          type="number"
          value={year}
          min={2000}
          max={currentYear() + 5}
          onChange={(e) => onYearChange(Number(e.target.value))}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
          }}
        />
      </div>

      {error && (
        <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,0,0,0.12)" }}>
          <b>Error:</b> {error}
        </div>
      )}

      {savedHint && (
        <div style={{ padding: 10, borderRadius: 12, background: "rgba(0,0,0,0.08)" }}>
          {savedHint}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {SPORTS.map((s) => (
          <div
            key={s.key}
            style={{
              border: "1px solid rgba(0,0,0,0.10)",
              borderRadius: 16,
              padding: 12,
              background: "rgba(255,255,255,0.7)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{s.label}</div>

            <div style={{ display: "grid", gap: 10 }}>
              {METRICS.map((m) => {
                const value = draft.perSport[s.key]?.[m.key];
                return (
                  <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ width: 90, opacity: 0.85 }}>{m.label}</label>

                    <input
                      inputMode="decimal"
                      placeholder="—"
                      value={typeof value === "number" ? String(value) : ""}
                      onChange={(e) => setValue(s.key, m.key, e.target.value)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.15)",
                      }}
                    />

                    <span style={{ width: 36, textAlign: "right", opacity: 0.7 }}>{m.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={loading || !hasAnyValues}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "none",
            background: "black",
            color: "white",
            cursor: "pointer",
            opacity: loading || !hasAnyValues ? 0.6 : 1,
          }}
        >
          {loading ? "Saving…" : "Save goals"}
        </button>

        <button
          type="button"
          onClick={() => setDraft(emptyGoals(year))}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.2)",
            background: "transparent",
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Reset form
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.2)",
            background: "transparent",
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Delete saved goals
        </button>
      </div>
    </div>
  );
}
