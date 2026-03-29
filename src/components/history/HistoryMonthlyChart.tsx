import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  type RectangleProps,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

import type { HistoryMetric, MonthlySeriesItem } from "../../domain/metrics/monthly";
import { formatNumber } from "../../utils/format";

export type SportFilter = "all" | "run" | "ride";

type Props = {
  metric: HistoryMetric;
  data: MonthlySeriesItem[];
  sportFilter?: SportFilter;
};

function formatTick(metric: HistoryMetric, value: number): string {
  if (metric === "distance") {
    return formatNumber(value, { maximumFractionDigits: 0 });
  }
  if (metric === "elevation") {
    return formatNumber(value, { maximumFractionDigits: 0 });
  }
  return formatNumber(Math.round(value), { maximumFractionDigits: 0 });
}

function formatValue(metric: HistoryMetric, value: number): string {
  if (metric === "distance") {
    return `${formatNumber(value, { maximumFractionDigits: 1 })} km`;
  }
  if (metric === "elevation") {
    return `${formatNumber(value, { maximumFractionDigits: 0 })} m`;
  }
  const rounded = Math.round(value);
  const unit = rounded === 1 ? "activity" : "activities";
  return `${formatNumber(rounded, { maximumFractionDigits: 0 })} ${unit}`;
}

// Color palette (year-independent for single-year chart)
const COLOR_RUN = "var(--accent-green)";   // green
const COLOR_RIDE = "var(--status-over)";   // blue

function CustomTooltip({
  active,
  payload,
  label,
  metric,
  sportFilter = "all",
}: TooltipProps<number, string> & { metric: HistoryMetric; sportFilter?: SportFilter }) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as MonthlySeriesItem | undefined;
  if (!row) return null;

  const running = Number(row.running ?? 0);
  const cycling = Number(row.cycling ?? 0);
  const total = Number(row.total ?? running + cycling);

  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
        minWidth: 140,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {sportFilter === "all" && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          Total: <span style={{ color: "var(--text)" }}>{formatValue(metric, total)}</span>
        </div>
      )}
      {(sportFilter === "all" || sportFilter === "run") && running > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Running: <span style={{ color: "var(--text)" }}>{formatValue(metric, running)}</span>
        </div>
      )}
      {(sportFilter === "all" || sportFilter === "ride") && cycling > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Cycling: <span style={{ color: "var(--text)" }}>{formatValue(metric, cycling)}</span>
        </div>
      )}
    </div>
  );
}

/** Running bar: flat bottom on stacked, rounded top only when it's the top segment. */
function RunningBarShape(props: RectangleProps & { payload?: MonthlySeriesItem }) {
  const { payload, ...rest } = props;
  const hasCycling = (payload?.cycling ?? 0) > 0;
  const radius: [number, number, number, number] = hasCycling ? [0, 0, 0, 0] : [8, 8, 0, 0];
  return <Rectangle {...rest} radius={radius} />;
}

export default function HistoryMonthlyChart({ metric, data, sportFilter = "all" }: Props) {
  const hasRunning = data.some((d) => d.running > 0);
  const hasCycling = data.some((d) => d.cycling > 0);

  const showRunning = sportFilter === "all" ? hasRunning : sportFilter === "run" && hasRunning;
  const showCycling = sportFilter === "all" ? hasCycling : sportFilter === "ride" && hasCycling;
  const hasVisible = showRunning || showCycling;

  return (
    <>
      {!hasVisible && (
        <div className="text-muted" style={{ marginTop: 16 }}>
          No data for this year.
        </div>
      )}

      {hasVisible && (
        <div
          style={{ width: "100%", height: 220, marginTop: 8, transition: "opacity 0.25s ease" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 16, bottom: 44 }}
              barCategoryGap="20%"
              barGap={4}
              barSize={20}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickMargin={8} axisLine={false} tickLine={false} />
              <YAxis
                tickMargin={8}
                tickFormatter={(value: number) => formatTick(metric, Number(value))}
                axisLine={false}
                tickLine={false}
                tickCount={5}
                width={48}
                style={{ fontSize: 11, fill: "var(--text-muted)" }}
              />
              <Tooltip
                content={<CustomTooltip metric={metric} sportFilter={sportFilter} />}
                cursor={{ fillOpacity: 0.06 }}
              />
              <Legend
                verticalAlign="bottom"
                align="center"
                height={28}
                wrapperStyle={{ paddingTop: 8 }}
                formatter={(value) => (
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{value}</span>
                )}
              />
              {showRunning && (
                <Bar
                  dataKey="running"
                  stackId="a"
                  name="Running"
                  fill={COLOR_RUN}
                  shape={<RunningBarShape />}
                  isAnimationActive={true}
                  animationDuration={300}
                />
              )}
              {showCycling && (
                <Bar
                  dataKey="cycling"
                  stackId="a"
                  name="Cycling"
                  fill={COLOR_RIDE}
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={300}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
