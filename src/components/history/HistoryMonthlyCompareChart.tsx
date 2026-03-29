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

import type { HistoryMetric } from "../../domain/metrics/monthly";
import { formatNumber } from "../../utils/format";
import type { SportFilter } from "./HistoryMonthlyChart";

export type MonthlyCompareSeriesItem = {
  month: string;
  primary: number;
  secondary: number;
  delta: number;
  // Sport breakdown — used when sportFilter === "all" for stacked bars
  primaryRun: number;
  primaryRide: number;
  secondaryRun: number;
  secondaryRide: number;
};

// Year-based color palette: primary = green, secondary = blue (with lower opacity)
const COLOR_PRIMARY = "var(--accent-green)";
const COLOR_SECONDARY = "var(--status-over)";

type Props = {
  metric: HistoryMetric;
  data: MonthlyCompareSeriesItem[];
  primaryYear: number;
  secondaryYear: number;
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
  sportFilter = "all",
}: TooltipProps<number, string> & {
  metric: HistoryMetric;
  primaryYear: number;
  secondaryYear: number;
  sportFilter?: SportFilter;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as MonthlyCompareSeriesItem | undefined;
  if (!row) return null;

  const primaryTotal = sportFilter === "all" ? (row.primaryRun + row.primaryRide) : row.primary;
  const secondaryTotal = sportFilter === "all" ? (row.secondaryRun + row.secondaryRide) : row.secondary;
  const delta = primaryTotal - secondaryTotal;

  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
        minWidth: 170,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: sportFilter === "all" ? 2 : 4 }}>
        {primaryYear}: <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatValue(metric, primaryTotal)}</span>
      </div>
      {sportFilter === "all" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, paddingLeft: 8 }}>
          Run: {formatValue(metric, row.primaryRun)} · Ride: {formatValue(metric, row.primaryRide)}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: sportFilter === "all" ? 2 : 6 }}>
        {secondaryYear}: <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatValue(metric, secondaryTotal)}</span>
      </div>
      {sportFilter === "all" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, paddingLeft: 8 }}>
          Run: {formatValue(metric, row.secondaryRun)} · Ride: {formatValue(metric, row.secondaryRide)}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
        Delta: <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatDelta(metric, delta)}</span>
      </div>
    </div>
  );
}

/** Bottom bar in a stacked pair: rounded top only when it's the top segment (no ride). */
function StackedRunShape(props: RectangleProps & { payload?: MonthlyCompareSeriesItem; rideKey: "primaryRide" | "secondaryRide" }) {
  const { payload, rideKey, ...rest } = props;
  const hasRide = (payload?.[rideKey] ?? 0) > 0;
  const radius: [number, number, number, number] = hasRide ? [0, 0, 0, 0] : [6, 6, 0, 0];
  return <Rectangle {...rest} radius={radius} />;
}

export default function HistoryMonthlyCompareChart({
  metric,
  data,
  primaryYear,
  secondaryYear,
  sportFilter = "all",
}: Props) {
  const hasData = sportFilter === "all"
    ? data.some((row) => row.primaryRun > 0 || row.primaryRide > 0 || row.secondaryRun > 0 || row.secondaryRide > 0)
    : data.some((row) => row.primary > 0 || row.secondary > 0);

  if (!hasData) {
    return (
      <div className="text-muted" style={{ marginTop: 16 }}>
        No data for these years.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 230, marginTop: 8, transition: "opacity 0.25s ease" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 16, bottom: 44 }}
          barCategoryGap={sportFilter === "all" ? "25%" : "40%"}
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
            domain={[0, "dataMax"]}
            style={{ fontSize: 11, fill: "var(--text-muted)" }}
          />
          <Tooltip
            content={(
              <CompareTooltip
                metric={metric}
                primaryYear={primaryYear}
                secondaryYear={secondaryYear}
                sportFilter={sportFilter}
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

          {/* Stacked bars: primary year (run + ride) */}
          {sportFilter === "all" && (
            <Bar
              dataKey="primaryRun"
              stackId="primary"
              name={`${primaryYear} Run`}
              fill={COLOR_PRIMARY}
              fillOpacity={1}
              shape={<StackedRunShape rideKey="primaryRide" />}
              barSize={10}
              isAnimationActive={true}
              animationDuration={300}
            />
          )}
          {sportFilter === "all" && (
            <Bar
              dataKey="primaryRide"
              stackId="primary"
              name={`${primaryYear} Ride`}
              fill={COLOR_PRIMARY}
              fillOpacity={0.5}
              radius={[6, 6, 0, 0]}
              barSize={10}
              isAnimationActive={true}
              animationDuration={300}
            />
          )}
          {/* Stacked bars: secondary year (run + ride) */}
          {sportFilter === "all" && (
            <Bar
              dataKey="secondaryRun"
              stackId="secondary"
              name={`${secondaryYear} Run`}
              fill={COLOR_SECONDARY}
              fillOpacity={0.8}
              shape={<StackedRunShape rideKey="secondaryRide" />}
              barSize={10}
              isAnimationActive={true}
              animationDuration={300}
            />
          )}
          {sportFilter === "all" && (
            <Bar
              dataKey="secondaryRide"
              stackId="secondary"
              name={`${secondaryYear} Ride`}
              fill={COLOR_SECONDARY}
              fillOpacity={0.35}
              radius={[6, 6, 0, 0]}
              barSize={10}
              isAnimationActive={true}
              animationDuration={300}
            />
          )}
          {/* Grouped bars: single sport totals */}
          {sportFilter !== "all" && (
            <Bar
              dataKey="primary"
              name={`${primaryYear}`}
              fill={COLOR_PRIMARY}
              radius={[8, 8, 0, 0]}
              barSize={12}
              isAnimationActive={true}
              animationDuration={300}
            />
          )}
          {sportFilter !== "all" && (
            <Bar
              dataKey="secondary"
              name={`${secondaryYear}`}
              fill={COLOR_SECONDARY}
              fillOpacity={0.45}
              radius={[8, 8, 0, 0]}
              barSize={12}
              isAnimationActive={true}
              animationDuration={300}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
