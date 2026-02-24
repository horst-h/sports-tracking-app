import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useActivities } from '../hooks/useActivities';
import { useAthlete } from '../hooks/useAthlete';
import { useAuth } from '../hooks/useAuth';
import { buildUiAthleteStats } from '../domain/metrics/uiStats';
import { aggregateYear } from '../domain/metrics/aggregate';
import { normalizeActivities } from '../domain/metrics/normalize';
import { deriveMetricFacts } from '../domain/insights/deriveFacts';
import { buildNarrative } from '../domain/insights/narrative';
import type { Sport } from '../domain/metrics/types';
import { useGoals } from '../hooks/useGoals';
import { useAnalyzeNarrative } from '../hooks/useAnalyzeNarrative';
import type { AnalyzeFacts as LlmAnalyzeFacts } from '../domain/ai/contracts/analyzeNarrative';
import RunningIcon from '../components/icons/RunningIcon';
import CyclingIcon from '../components/icons/CyclingIcon';
import GoalTrendChartDetail from '../components/chart/GoalTrendChartDetail';

const VALID_SPORTS: Sport[] = ['run', 'ride']; // AI analysis currently only supports run/ride
const VALID_METRICS = ['distance', 'count', 'elevation'];

// Time context helpers
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function getTotalDaysInYear(year: number): number {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

function computeExpectedProgressPercent(dayOfYear: number, totalDaysInYear: number): number {
  return Math.round((dayOfYear / totalDaysInYear) * 100);
}

function calculateGoalStatus(requiredPerWeek: number, trendPerWeek: number): "on_track" | "close" | "off_track" {
  const ratio = requiredPerWeek > 0 ? trendPerWeek / requiredPerWeek : 1;
  if (ratio >= 1.15) return "on_track";
  if (ratio >= 0.95) return "close";
  return "off_track";
}

// Helper: Convert domain activity to Strava-like (same as App.tsx)
function toStravaLike(a: any) {
  if (!a || typeof a !== 'object') return a;

  if (
    typeof a.type === 'string' &&
    typeof a.start_date_local === 'string' &&
    typeof a.distance === 'number'
  ) {
    return a;
  }

  if (
    (a.sport === 'run' || a.sport === 'ride' || a.sport === 'swim') &&
    typeof a.startDate === 'string' &&
    typeof a.distanceKm === 'number'
  ) {
    return {
      id: a.id,
      type: a.sport === 'run' ? 'Run' : a.sport === 'ride' ? 'Ride' : 'Swim',
      start_date_local: a.startDate,
      distance: a.distanceKm * 1000,
      total_elevation_gain: Number(a.elevationM ?? 0),
      moving_time: Number(a.movingTimeSec ?? 0),
      name: a.name,
    };
  }

  return a;
}

export default function AnalyzePage() {
  const navigate = useNavigate();
  const { sport: sportParam, metric: metricParam } = useParams();

  // Validate route params
  const sport = sportParam as Sport | undefined;
  const metric = metricParam as 'distance' | 'count' | 'elevation' | undefined;

  const isValidSport = sport && VALID_SPORTS.includes(sport);
  const isValidMetric = metric && VALID_METRICS.includes(metric);

  // Load data
  const year = new Date().getFullYear();
  const { token } = useAuth();
  const enabled = !!token && !!isValidSport && !!isValidMetric;
  const { activities, loading: activitiesLoading } = useActivities(year, enabled);
  useAthlete(enabled); // Ensure athlete is loaded but not directly used
  const { goals } = useGoals(year);

  if (!isValidSport || !isValidMetric) {
    return (
      <div className="container-page">
        <div className="card card--primary" style={{ marginTop: '2rem' }}>
          <div className="card__body">
            <h2 style={{ color: 'var(--text-muted)' }}>Invalid route</h2>
            <p style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              sport={sportParam}, metric={metricParam}
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                cursor: 'pointer',
              }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Build UI stats with same logic as App.tsx
  const uiStats = useMemo(() => {
    if (!token || !activities || activities.length === 0 || !goals) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);
    const agg = aggregateYear(normalized, year, sport, asOfLocalIso);
    const sportGoals = goals?.perSport?.[sport];

    const stats = buildUiAthleteStats({
      aggregate: agg,
      asOfDateLocal: asOfLocalIso,
      retrievedAtLocal,
      goals: sportGoals,
      mode: 'ytd',
      blendWeightRolling: 0.6,
    });

    return stats;
  }, [activities, goals, year, sport]);

  // Build aggregate for chart visualization
  const aggregate = useMemo(() => {
    if (!token || !activities || activities.length === 0) return null;

    const asOfLocalIso = new Date().toISOString();
    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);
    const agg = aggregateYear(normalized, year, sport, asOfLocalIso);

    return agg;
  }, [activities, year, sport, token]);

  // Derive facts
  const facts = useMemo(() => {
    if (!uiStats || !goals || !sport || !metric) return null;
    // Type assertion: sport is validated as "run" or "ride" by VALID_SPORTS check
    return deriveMetricFacts(sport as "run" | "ride", metric, uiStats, goals.perSport);
  }, [uiStats, goals, sport, metric]);

  // Compute cross-sport stats for context (hoisted to avoid nested useMemo)
  const otherSportStats = useMemo(() => {
    if (!sport) return null;
    const otherSport = sport === 'run' ? 'ride' : 'run';
    const otherSportGoals = goals?.perSport[otherSport];
    
    if (!activities || !otherSportGoals) return null;
    
    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);
    const agg = aggregateYear(normalized, year, otherSport, new Date().toISOString());
    
    return buildUiAthleteStats({
      aggregate: agg,
      asOfDateLocal: new Date().toISOString(),
      retrievedAtLocal: new Date().toString(),
      goals: otherSportGoals,
      mode: 'ytd',
    });
  }, [activities, goals, year, sport]);

  // Map domain facts -> LLM facts
  const llmFacts: LlmAnalyzeFacts | null = useMemo(() => {
    if (!facts || !sport || !metric) return null;

    // Type assertion: sport is validated as "run" or "ride" by VALID_SPORTS check
    const sportForAi = sport as "run" | "ride";

    // Compute time context
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];
    const dayOfYear = getDayOfYear(today);
    const totalDaysInYear = getTotalDaysInYear(today.getFullYear());
    const expectedProgressPercent = computeExpectedProgressPercent(dayOfYear, totalDaysInYear);

    // Compute cross-sport context
    const otherSport = sportForAi === 'run' ? 'ride' : 'run';
    const otherSportGoals = goals?.perSport[otherSport];

    let otherSportContext: LlmAnalyzeFacts['otherSport'] | undefined;
    if (otherSportStats && otherSportGoals) {
      // Find the same metric for the other sport
      const otherMetricKey = metric === 'distance' ? 'distanceKm' : metric === 'count' ? 'count' : 'elevationM';
      const otherGoalValue = otherSportGoals[otherMetricKey];
      const otherProgress = otherSportStats.progress[otherMetricKey];
      
      if (otherGoalValue && otherProgress) {
        const otherProgressPercent = Math.round((otherProgress.ytd / otherGoalValue) * 100);
        const otherRequiredPerWeek = otherSportStats.weeksLeftExact > 0 
          ? Math.max(0, otherGoalValue - otherProgress.ytd) / otherSportStats.weeksLeftExact 
          : 0;
        const otherStatus = calculateGoalStatus(
          otherRequiredPerWeek, 
          otherProgress.avgPerWeek
        );
        
        otherSportContext = {
          sport: otherSport,
          progressPercent: otherProgressPercent,
          status: otherStatus,
          trendPerWeek: Math.round(otherProgress.avgPerWeek * 100) / 100,
        };
      }
    }

    return {
      sport: sportForAi,
      metric,
      already: facts.ytd,
      goal: facts.goal,
      remaining: facts.remaining,
      requiredPerWeek: facts.requiredPerWeek,
      trendPerWeek: facts.trendPerWeek,
      forecastEoy: facts.forecastEoy,
      weeksLeft: facts.weeksLeft,
      avgPerActivity: facts.avgPerUnit,
      // Time context
      todayISO,
      dayOfYear,
      totalDaysInYear,
      expectedProgressPercent,
      // Cross-sport context
      otherSport: otherSportContext,
    };
  }, [facts, sport, metric, goals, otherSportStats]);


  const aiEnabled = true; // später als Setting/Toggle
  const { data: aiNarrative, loading: aiLoading, error: aiError, debug: aiDebug } =
    useAnalyzeNarrative(llmFacts, aiEnabled);

  const aiFootnote = useMemo(() => {
    if (!aiNarrative || !aiDebug?.timestamp) return null;
    const modelLabel = aiDebug.model ? `Model ${aiDebug.model}` : "Model unknown";
    const when = new Date(aiDebug.timestamp).toLocaleString();
    return `AI-generated · ${when} · ${modelLabel}`;
  }, [aiNarrative, aiDebug]);


  // Build narrative
  const narrative = useMemo(() => {
    if (!facts) return null;
    return buildNarrative(sport, metric, facts);
  }, [facts, sport, metric]);

  if (activitiesLoading) {
    return (
      <div className="container-page">
        <p style={{ marginTop: '2rem', color: 'var(--text-muted)' }}>
          Loading…
        </p>
      </div>
    );
  }

  if (!uiStats || !facts || !narrative) {
    return (
      <div className="container-page">
        <button
          onClick={() => navigate(-1)}
          className="nav-back"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="card card--primary">
          <div className="card__body">
            <h2 style={{ color: 'var(--text-muted)' }}>No data</h2>
            <p style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              {!token
                ? 'Sign in with Strava first.'
                : 'Sync activities from Strava first.'}
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                cursor: 'pointer',
              }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page" style={{ paddingBottom: '2rem' }}>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="nav-back"
        aria-label="Go back"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      {/* Title */}
      <h1
        style={{ 
          marginBottom: '1.5rem', 
          fontSize: '28px', 
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', width: '28px', height: '28px' }}>
          {sport === 'run' ? <RunningIcon /> : <CyclingIcon />}
        </span>
        {narrative.title}
      </h1>

      {/* Narrative */}
      {/* Narrative (AI preferred, fallback to rule-based) */}
      <div className="card card--primary" style={{ marginBottom: '2rem' }}>
        <div className="card__body">
          {aiEnabled ? (
            aiNarrative ? (
              <>
                <h2
                  style={{
                    marginBottom: '0.75rem',
                    fontSize: '18px',
                    fontWeight: '700',
                  }}
                >
                  {aiNarrative.headline}
                </h2>

                <p style={{ lineHeight: '1.6', color: 'var(--text)' }}>
                  {aiNarrative.paragraph}
                </p>

                <ul
                  style={{
                    marginTop: '1rem',
                    paddingLeft: '1.25rem',
                    lineHeight: '1.6',
                  }}
                >
                  <li>{aiNarrative.bullets[0]}</li>
                  <li>{aiNarrative.bullets[1]}</li>
                </ul>

                {aiFootnote && <div className="ai-footnote">{aiFootnote}</div>}
              </>
            ) : aiLoading ? (
              <div className="ai-loading" aria-live="polite" aria-busy="true">
                <div className="ai-loading__dots" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div className="ai-loading__label">Analyzing…</div>
              </div>
            ) : (
              <>
                {aiError && (
                  <p
                    style={{
                      marginBottom: '0.75rem',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                    }}
                  >
                    AI not available right now – showing standard analysis.
                  </p>
                )}
                {narrative.paragraphs.map((p, i) => (
                  <p
                    key={i}
                    style={{
                      marginBottom:
                        i < narrative.paragraphs.length - 1 ? '1rem' : 0,
                      lineHeight: '1.6',
                      color: 'var(--text)',
                    }}
                  >
                    {p}
                  </p>
                ))}
              </>
            )
          ) : (
            <>
              {narrative.paragraphs.map((p, i) => (
                <p
                  key={i}
                  style={{
                    marginBottom:
                      i < narrative.paragraphs.length - 1 ? '1rem' : 0,
                    lineHeight: '1.6',
                    color: 'var(--text)',
                  }}
                >
                  {p}
                </p>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Facts */}
      <div className="card card--primary">
        <div className="card__body">
          <div style={{ display: 'grid', gap: '1rem' }}>
            {narrative.bullets.map((bullet, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: i < narrative.bullets.length - 1 ? '1rem' : 0,
                  borderBottom:
                    i < narrative.bullets.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  {bullet.label}
                </span>
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: 'var(--text)',
                  }}
                >
                  {bullet.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Goal Trend Chart */}
      {aggregate && uiStats && (
        <div className="card card--primary" style={{ marginTop: '2rem' }}>
          <div className="card__body">
            <h2 style={{ marginBottom: '1rem', fontSize: '18px', fontWeight: '700' }}>
              Year Progress
            </h2>
            <GoalTrendChartDetail
              aggregate={aggregate}
              yearlyGoal={uiStats.progress[metric === 'distance' ? 'distanceKm' : metric === 'count' ? 'count' : 'elevationM'].goal}
              metric={metric as 'distance' | 'count' | 'elevation'}
              year={year}
            />
          </div>
        </div>
      )}

      {/* DEBUG PANEL (dev mode only) */}
      {import.meta.env.DEV && aiDebug && (
        <div
          style={{
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '0.5rem',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#aaa',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#fff' }}>
            🐛 DEBUG
          </h3>

          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Source:</strong>{' '}
            <span
              style={{
                color:
                  aiDebug.source === 'llm'
                    ? '#4ade80'
                    : aiDebug.source === 'cache'
                      ? '#fbbf24'
                      : '#ef4444',
              }}
            >
              {aiDebug.source.toUpperCase()}
            </span>
          </div>

          {aiDebug.model && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Model:</strong> {aiDebug.model}
            </div>
          )}

          {aiDebug.durationMs !== undefined && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Duration:</strong> {aiDebug.durationMs}ms
            </div>
          )}

          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Timestamp:</strong>{' '}
            {new Date(aiDebug.timestamp).toLocaleTimeString('de-DE')}
          </div>

          {aiError && (
            <div style={{ marginTop: '0.5rem', color: '#ef4444' }}>
              <strong>Error:</strong> {aiError}
            </div>
          )}

          {aiLoading && (
            <div style={{ marginTop: '0.5rem', color: '#60a5fa' }}>
              <strong>Loading...</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
