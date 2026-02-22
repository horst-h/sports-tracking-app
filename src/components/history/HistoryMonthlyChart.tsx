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

type Props = {
  metric: HistoryMetric;
  data: MonthlySeriesItem[];
  year?: number;
};

function metricLabel(metric: HistoryMetric): string {
  if (metric === "distance") return "Distance";
  if (metric === "elevation") return "Elevation";
  return "Activities";
}

function unitLabel(metric: HistoryMetric): string {
  if (metric === "distance") return "km";
  if (metric === "elevation") return "m";
  return "activities";
}

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

function CustomTooltip({ active, payload, label, metric }: TooltipProps<number, string> & { metric: HistoryMetric }) {
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
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
        Total: <span style={{ color: "var(--text)" }}>{formatValue(metric, total)}</span>
      </div>
      {running > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Running: <span style={{ color: "var(--text)" }}>{formatValue(metric, running)}</span>
        </div>
      )}
      {cycling > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Cycling: <span style={{ color: "var(--text)" }}>{formatValue(metric, cycling)}</span>
        </div>
      )}
    </div>
  );
}

function RunningBarShape(props: RectangleProps & { payload?: MonthlySeriesItem }) {
  const { payload, ...rest } = props;
  const hasCycling = (payload?.cycling ?? 0) > 0;
  const radius: [number, number, number, number] = hasCycling ? [0, 0, 0, 0] : [8, 8, 0, 0];
  return <Rectangle {...rest} radius={radius} />;
}

export default function HistoryMonthlyChart({ metric, data, year }: Props) {
  const hasRunning = data.some((d) => d.running > 0);
  const hasCycling = data.some((d) => d.cycling > 0);

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 12,
        padding: "12px",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{metricLabel(metric)}</div>
        {year && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{year}</div>}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{unitLabel(metric)}</div>

      {!hasRunning && !hasCycling && (
        <div className="text-muted" style={{ marginTop: 16 }}>
          No data for this year.
        </div>
      )}

      {(hasRunning || hasCycling) && (
        <div style={{ width: "100%", height: 220, marginTop: 8 }}>
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
                content={<CustomTooltip metric={metric} />}
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
              {hasRunning && (
                <Bar
                  dataKey="running"
                  stackId="a"
                  name="Running"
                  fill="var(--accent-green)"
                  shape={<RunningBarShape />}
                />
              )}
              {hasCycling && (
                <Bar
                  dataKey="cycling"
                  stackId="a"
                  name="Cycling"
                  fill="var(--status-over)"
                  radius={[8, 8, 0, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
