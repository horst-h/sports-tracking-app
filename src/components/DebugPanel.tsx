import { useEffect, useMemo, useState } from "react";
import type { ForecastMode } from "../domain/metrics/uiStats";
import { loadToken, clearToken } from "../repositories/tokenRepository";
import { stravaClient } from "../data/strava/stravaClient";
import type { YearDashboard } from "../services/statsService";
import { buildYearDashboard } from "../services/statsService";

type DebugData = {
  year: number;
  mode: ForecastMode;
  dashboard?: YearDashboard;
  tokenInfo?: { hasToken: boolean; expiresAt?: number };
};

function nowLocalString() {
  return new Date().toString();
}

function currentYear() {
  return new Date().getFullYear();
}

export default function DebugPanel() {
  const isDev = import.meta.env.DEV;
  const [open, setOpen] = useState(true);
  const [year, setYear] = useState<number>(currentYear());
  const [mode, setMode] = useState<ForecastMode>("ytd");
  const [blendWeightRolling, setBlendWeightRolling] = useState<number>(0.6);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DebugData>({ year, mode });

  if (!isDev) return null;

  useEffect(() => {
    setData((d) => ({ ...d, year, mode }));
  }, [year, mode]);

  async function refreshTokenInfo() {
    const t = await loadToken();
    setData((d) => ({
      ...d,
      tokenInfo: { hasToken: !!t, expiresAt: t?.expires_at },
    }));
  }

  async function loadDashboardFromStrava() {
    setLoading(true);
    setErr(null);
    try {
      const asOfLocalIso = new Date().toISOString();
      const retrievedAtLocal = nowLocalString();

      // Pull activities for year
      const after = Math.floor(new Date(year, 0, 1).getTime() / 1000);
      const before = Math.floor(new Date(year + 1, 0, 1).getTime() / 1000);

      // Fetch pages until empty (simple, debug-only)
      const all: any[] = [];
      let page = 1;
      const perPage = 200;

      while (true) {
        const chunk = await stravaClient.listActivities({ page, perPage, after, before });
        all.push(...chunk);
        if (chunk.length < perPage) break;
        page += 1;
        if (page > 20) break; // safety
      }

      const dashboard = await buildYearDashboard({
        year,
        activities: all,
        mode,
        blendWeightRolling,
        asOfDateLocal: asOfLocalIso,
        retrievedAtLocal,
      });

      setData((d) => ({ ...d, dashboard }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runSmokeInBrowser() {
    setErr(null);
    try {
      const m = await import("/src/domain/metrics/smoke.ts");
      const out = m.runSmoke?.();
      // eslint-disable-next-line no-console
      console.log("SMOKE OUTPUT:", out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function doClearToken() {
    await clearToken();
    await refreshTokenInfo();
  }

  useEffect(() => {
    void refreshTokenInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pretty = useMemo(() => JSON.stringify(data.dashboard ?? data, null, 2), [data]);

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        width: open ? 420 : 180,
        maxHeight: open ? "80vh" : "auto",
        overflow: "auto",
        background: "rgba(20,20,20,0.92)",
        color: "#fff",
        borderRadius: 12,
        padding: 12,
        fontSize: 12,
        zIndex: 9999,
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong>DebugPanel</strong>
        <button onClick={() => setOpen((v) => !v)} style={{ padding: "4px 8px" }}>
          {open ? "close" : "open"}
        </button>
      </div>

      {open && (
        <>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ width: 80 }}>Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ flex: 1, padding: 6, borderRadius: 8, border: "1px solid #444" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ width: 80 }}>Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ForecastMode)}
                style={{ flex: 1, padding: 6, borderRadius: 8, border: "1px solid #444" }}
              >
                <option value="ytd">ytd</option>
                <option value="rolling28">rolling28</option>
                <option value="blend">blend</option>
              </select>
            </div>

            {mode === "blend" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ width: 80 }}>Blend</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={blendWeightRolling}
                  onChange={(e) => setBlendWeightRolling(Number(e.target.value))}
                  style={{ flex: 1, padding: 6, borderRadius: 8, border: "1px solid #444" }}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={loading} onClick={loadDashboardFromStrava} style={{ padding: "6px 10px" }}>
                {loading ? "Loading…" : "Load dashboard from Strava"}
              </button>
              <button onClick={runSmokeInBrowser} style={{ padding: "6px 10px" }}>
                Run smoke (browser)
              </button>
              <button onClick={refreshTokenInfo} style={{ padding: "6px 10px" }}>
                Token info
              </button>
              <button onClick={doClearToken} style={{ padding: "6px 10px" }}>
                Clear token
              </button>
            </div>

            {err && (
              <div style={{ background: "rgba(255,0,0,0.18)", padding: 8, borderRadius: 8 }}>
                <strong>Error:</strong> {err}
              </div>
            )}

            <div style={{ opacity: 0.85 }}>
              Token:{" "}
              {data.tokenInfo?.hasToken ? `present (expires_at=${data.tokenInfo.expiresAt})` : "none"}
            </div>

            <details>
              <summary style={{ cursor: "pointer" }}>Raw Debug Data</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{pretty}</pre>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
