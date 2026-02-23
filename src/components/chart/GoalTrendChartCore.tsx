import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
  ReferenceArea,
  type TooltipProps,
} from "recharts";

export type GoalTrendChartData = {
  month: string;
  monthIndex: number;
  monthlyActual: number | null;
  planAvgMonthly: number;
  planLowerBound: number;
  planUpperBound: number;
  actualAvgMonthly: number;
  isOnTrack: boolean;
};

type Props = {
  data: GoalTrendChartData[];
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
};

function CustomTooltip({
  active,
  payload,
  formatValue,
}: TooltipProps<number, string> & { formatValue: (value: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;

  // payload[0] is the Bar (monthlyActual if it exists), then Line data points
  const dataPoint = payload[0]?.payload as GoalTrendChartData | undefined;
  if (!dataPoint) return null;

  return (
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{dataPoint.month}</div>

      {dataPoint.monthlyActual !== null && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          Actual:{" "}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {formatValue(dataPoint.monthlyActual)}
          </span>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
        Plan (Ø/Month):{" "}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>
          {formatValue(dataPoint.planAvgMonthly)}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Actual (Ø/Month):{" "}
        <span
          style={{
            color: dataPoint.isOnTrack ? "#1f5f3a" : "#ff9800",
            fontWeight: 600,
          }}
        >
          {formatValue(dataPoint.actualAvgMonthly)}
        </span>
      </div>
    </div>
  );
}

export default function GoalTrendChartCore({
  data,
  formatValue,
  formatTick,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="text-muted" style={{ marginTop: 16 }}>
        No data for this period.
      </div>
    );
  }

  // Determine if on track from the data (all points have same status)
  const isOnTrack = data[0]?.isOnTrack ?? false;
  // Use a darker/teal green for Actual line to distinguish from bars
  const actualLineColor = isOnTrack ? "#1f5f3a" : "#ff9800";

  // Get first data point to access plan and actual averages for legend
  const firstDataPoint = data[0];
  const planAvgValue = firstDataPoint?.planAvgMonthly ?? 0;
  const planLowerBound = firstDataPoint?.planLowerBound ?? 0;
  const planUpperBound = firstDataPoint?.planUpperBound ?? 0;
  const planLabel = `Plan (${formatValue(planAvgValue)}/Month)`;
  const actualLabel = `Actual (${formatValue(firstDataPoint?.actualAvgMonthly ?? 0)}/Month)`;

  return (
    <div style={{ width: "100%", height: 280, marginTop: 16 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 16, bottom: 44 }}
          barCategoryGap="20%"
          barGap={4}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickMargin={8}
            axisLine={false}
            tickLine={false}
            style={{ fontSize: 12 }}
          />
          <YAxis
            tickMargin={8}
            tickFormatter={formatTick}
            axisLine={false}
            tickLine={false}
            tickCount={5}
            width={48}
            style={{ fontSize: 11, fill: "var(--text-muted)" }}
          />
          <Tooltip
            content={<CustomTooltip formatValue={formatValue} />}
            cursor={{ fillOpacity: 0.06 }}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            height={28}
            wrapperStyle={{ paddingTop: 8 }}
            formatter={(value) => (
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {value}
              </span>
            )}
          />

          {/* Actual average line (darker green, solid, behind bars) */}
          <Line
            type="monotone"
            dataKey="actualAvgMonthly"
            name={actualLabel}
            stroke={actualLineColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />

          {/* Plan range reference area (±5% fill) */}
          <ReferenceArea
            y1={planLowerBound}
            y2={planUpperBound}
            fill="#e8eae8"
            stroke="none"
            fillOpacity={0.4}
          />

          {/* Monthly bars (on top) */}
          <Bar
            dataKey="monthlyActual"
            name="Actual"
            fill="var(--accent-green)"
            radius={[8, 8, 0, 0]}
          />

          {/* Plan average line at lower bound (light gray, subtle dash) */}
          <Line
            type="monotone"
            dataKey="planLowerBound"
            name={planLabel}
            stroke="#d0d0d0"
            strokeWidth={1.5}
            strokeDasharray="3 4"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
