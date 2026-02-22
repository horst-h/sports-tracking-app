import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

import type { HistoryMetric } from "../../domain/metrics/monthly";
import { formatNumber } from "../../utils/format";

export type MonthlyCompareSeriesItem = {
  month: string;
  primary: number;
  secondary: number;
  delta: number;
};

type Props = {
  metric: HistoryMetric;
  data: MonthlyCompareSeriesItem[];
  primaryYear: number;
  secondaryYear: number;
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

function formatDelta(metric: HistoryMetric, value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatValue(metric, Math.abs(value))}`;
}

function CompareTooltip({
  active,
  payload,
  label,
  metric,
  primaryYear,
  secondaryYear,
}: TooltipProps<number, string> & {
  metric: HistoryMetric;
  primaryYear: number;
  secondaryYear: number;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as MonthlyCompareSeriesItem | undefined;
  if (!row) return null;

  const deltaPrimaryMinusSecondary = row.primary - row.secondary;

  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
        {primaryYear}: <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatValue(metric, row.primary)}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
        {secondaryYear}: <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatValue(metric, row.secondary)}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
        Delta: <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatDelta(metric, deltaPrimaryMinusSecondary)}</span>
      </div>
    </div>
  );
}

export default function HistoryMonthlyCompareChart({
  metric,
  data,
  primaryYear,
  secondaryYear,
}: Props) {
  const hasData = data.some((row) => row.primary > 0 || row.secondary > 0);

  if (!hasData) {
    return (
      <div className="text-muted" style={{ marginTop: 16 }}>
        No data for these years.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 230, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 16, bottom: 44 }}
          barCategoryGap="40%"
          barGap={2}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickMargin={8} axisLine={false} tickLine={false} />
          <YAxis
            tickMargin={8}
            tickFormatter={(value: number) => formatTick(metric, Number(value))}
            axisLine={false}
            tickLine={false}
            tickCount={4}
            width={48}
            domain={[0, 'dataMax']}
            style={{ fontSize: 11, fill: "var(--text-muted)" }}
          />
          <Tooltip
            content={(
              <CompareTooltip
                metric={metric}
                primaryYear={primaryYear}
                secondaryYear={secondaryYear}
              />
            )}
            cursor={{ fillOpacity: 0.06 }}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            height={28}
            wrapperStyle={{ paddingTop: 8 }}
            iconType="rect"
            iconSize={10}
            formatter={(value) => (
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{value}</span>
            )}
          />
          <Bar
            dataKey="primary"
            name={`${primaryYear}`}
            fill="var(--accent-green)"
            radius={[8, 8, 0, 0]}
            barSize={12}
          />
          <Bar
            dataKey="secondary"
            name={`${secondaryYear}`}
            fill="var(--status-over)"
            fillOpacity={0.45}
            radius={[8, 8, 0, 0]}
            barSize={12}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
