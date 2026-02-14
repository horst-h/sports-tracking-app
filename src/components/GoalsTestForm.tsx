import { useState, useEffect } from "react";
import { useGoals } from "../hooks/useGoals.ts";
import type { YearGoals, Sport } from "../domain/metrics/types.ts";

/**
 * Test component for Goals storage.
 * This component is for testing only and can be discarded in final implementation.
 */
export function GoalsTestForm() {
  const currentYear = new Date().getFullYear();
  const { goals, loading, error, loadGoals, saveGoals, deleteGoals } = useGoals(currentYear);

  const [year, setYear] = useState(currentYear);
  const [runCount, setRunCount] = useState<number | "">("");
  const [runDistance, setRunDistance] = useState<number | "">("");
  const [runElevation, setRunElevation] = useState<number | "">("");

  const [rideCount, setRideCount] = useState<number | "">("");
  const [rideDistance, setRideDistance] = useState<number | "">("");
  const [rideElevation, setRideElevation] = useState<number | "">("");

  const [statusMessage, setStatusMessage] = useState<string>("");

  // Load goals when year changes
  useEffect(() => {
    const loadForYear = async () => {
      try {
        const loaded = await (async () => {
          const goalsForYear = await import("../repositories/goalsRepository.ts").then(
            (m) => m.loadGoals(year)
          );
          return goalsForYear;
        })();

        if (loaded) {
          setRunCount(loaded.perSport.run?.count ?? "");
          setRunDistance(loaded.perSport.run?.distanceKm ?? "");
          setRunElevation(loaded.perSport.run?.elevationM ?? "");

          setRideCount(loaded.perSport.ride?.count ?? "");
          setRideDistance(loaded.perSport.ride?.distanceKm ?? "");
          setRideElevation(loaded.perSport.ride?.elevationM ?? "");
        } else {
          // Reset form for new year
          setRunCount("");
          setRunDistance("");
          setRunElevation("");
          setRideCount("");
          setRideDistance("");
          setRideElevation("");
        }
      } catch (err) {
        setStatusMessage(`Error loading goals: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    };

    loadForYear();
  }, [year]);

  const handleSave = async () => {
    try {
      const newGoals: YearGoals = {
        year,
        perSport: {
          run: {
            count: runCount ? Number(runCount) : undefined,
            distanceKm: runDistance ? Number(runDistance) : undefined,
            elevationM: runElevation ? Number(runElevation) : undefined,
          },
          ride: {
            count: rideCount ? Number(rideCount) : undefined,
            distanceKm: rideDistance ? Number(rideDistance) : undefined,
            elevationM: rideElevation ? Number(rideElevation) : undefined,
          },
        },
      };

      await saveGoals(newGoals);
      setStatusMessage("✅ Goals saved successfully!");
      setTimeout(() => setStatusMessage(""), 3000);
    } catch (err) {
      setStatusMessage(`❌ Error saving goals: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Delete goals for ${year}?`)) {
      try {
        await deleteGoals();
        setRunCount("");
        setRunDistance("");
        setRunElevation("");
        setRideCount("");
        setRideDistance("");
        setRideElevation("");
        setStatusMessage("✅ Goals deleted!");
        setTimeout(() => setStatusMessage(""), 3000);
      } catch (err) {
        setStatusMessage(`❌ Error deleting goals: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Goals Tester (Test Only - Delete Later)</h1>

      {/* Year Selector */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          Year:{" "}
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2099}
            style={{ padding: "5px", width: "80px" }}
          />
        </label>
      </div>

      {error && <div style={{ color: "red", marginBottom: "10px" }}>⚠️ Error: {error}</div>}

      {statusMessage && (
        <div
          style={{
            padding: "10px",
            marginBottom: "15px",
            backgroundColor: statusMessage.includes("✅") ? "#d4edda" : "#f8d7da",
            color: statusMessage.includes("✅") ? "#155724" : "#721c24",
            borderRadius: "4px",
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Goals Form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px" }}>
        {/* RUN Goals */}
        <div style={{ border: "1px solid #ddd", padding: "15px", borderRadius: "4px" }}>
          <h3>RUN Goals</h3>
          <div style={{ marginBottom: "10px" }}>
            <label>
              Count (units):
              <input
                type="number"
                value={runCount}
                onChange={(e) => setRunCount(e.target.value ? Number(e.target.value) : "")}
                placeholder="Leave empty for no goal"
                style={{ padding: "5px", width: "100%", marginTop: "5px" }}
              />
            </label>
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label>
              Distance (km):
              <input
                type="number"
                value={runDistance}
                onChange={(e) => setRunDistance(e.target.value ? Number(e.target.value) : "")}
                placeholder="Leave empty for no goal"
                step={0.1}
                style={{ padding: "5px", width: "100%", marginTop: "5px" }}
              />
            </label>
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label>
              Elevation (m):
              <input
                type="number"
                value={runElevation}
                onChange={(e) => setRunElevation(e.target.value ? Number(e.target.value) : "")}
                placeholder="Leave empty for no goal"
                style={{ padding: "5px", width: "100%", marginTop: "5px" }}
              />
            </label>
          </div>
        </div>

        {/* RIDE Goals */}
        <div style={{ border: "1px solid #ddd", padding: "15px", borderRadius: "4px" }}>
          <h3>RIDE Goals</h3>
          <div style={{ marginBottom: "10px" }}>
            <label>
              Count (units):
              <input
                type="number"
                value={rideCount}
                onChange={(e) => setRideCount(e.target.value ? Number(e.target.value) : "")}
                placeholder="Leave empty for no goal"
                style={{ padding: "5px", width: "100%", marginTop: "5px" }}
              />
            </label>
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label>
              Distance (km):
              <input
                type="number"
                value={rideDistance}
                onChange={(e) => setRideDistance(e.target.value ? Number(e.target.value) : "")}
                placeholder="Leave empty for no goal"
                step={0.1}
                style={{ padding: "5px", width: "100%", marginTop: "5px" }}
              />
            </label>
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label>
              Elevation (m):
              <input
                type="number"
                value={rideElevation}
                onChange={(e) => setRideElevation(e.target.value ? Number(e.target.value) : "")}
                placeholder="Leave empty for no goal"
                style={{ padding: "5px", width: "100%", marginTop: "5px" }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            padding: "10px 20px",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Saving..." : "Save Goals"}
        </button>
        <button
          onClick={handleDelete}
          disabled={loading || !goals}
          style={{
            padding: "10px 20px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading || !goals ? "not-allowed" : "pointer",
            opacity: loading || !goals ? 0.6 : 1,
          }}
        >
          {loading ? "Deleting..." : "Delete Goals"}
        </button>
      </div>

      {/* Current Stored Value */}
      {goals && (
        <div style={{ marginTop: "20px", padding: "15px", backgroundColor: "#f0f0f0", borderRadius: "4px" }}>
          <h3>Currently Stored:</h3>
          <pre style={{ overflow: "auto", fontSize: "12px" }}>{JSON.stringify(goals, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
