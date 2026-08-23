import type { ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  Line,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
  type RectangleProps,
  type TooltipProps,
} from "recharts";

/** How a single month compares to the required monthly average. */
export type MonthPerformance = "below" | "onTarget" | "above";

export type GoalTrendChartData = {
  month: string;
  monthIndex: number;
  monthlyActual: number | null;
  /** Where the month lands at its current pace. Equals the actual once it is over. */
  projectedMonthly: number | null;
  /** What the bar reaches: the projection, with the actual drawn solid inside it. */
  barTop: number | null;
  /** True for the running month of the current year, and only then. */
  isInProgress: boolean;
  /** Fraction of the month already behind us; 1 for any finished month. */
  monthProgress: number;
  daysInMonth: number;
  dayOfMonth: number;
  /** The pace that reaches the yearly goal (goal / 12). */
  requiredAvgMonthly: number;
  requiredLowerBound: number;
  requiredUpperBound: number;
  actualAvgMonthly: number;
  /** null for months that have no bar yet. */
  performance: MonthPerformance | null;
  isBestMonth: boolean;
  isOnTrack: boolean;
};

type Props = {
  data: GoalTrendChartData[];
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
};

const PERFORMANCE_COLOR: Record<MonthPerformance, string> = {
  below: "var(--chart-below)",
  onTarget: "var(--chart-on-target)",
  above: "var(--chart-above)",
};

const PERFORMANCE_LABEL: Record<MonthPerformance, string> = {
  below: "Below required Ø",
  onTarget: "On required Ø",
  above: "Above required Ø",
};

const REQUIRED_LINE_COLOR = "var(--chart-reference)";

/** A month that has started but is too young to extrapolate from. */
const PENDING_COLOR = "var(--chart-pending)";

const BADGE_RADIUS = 11;
/** Vertical gap between the top of the best bar and the badge. */
const BADGE_GAP = 7;

function BestMonthBadge({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={BADGE_RADIUS} fill="var(--pill-active-bg)" />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fill="#ffffff"
      >
        ★
      </text>
    </g>
  );
}

/** How solid the projected part of a running month is drawn. */
const PROJECTION_OPACITY = 0.3;

/**
 * Monthly bar: tinted by how the month rates against the required average,
 * badged when it is the best one.
 *
 * A running month is drawn twice. The bar reaches its projection, faintly, and
 * the part actually completed sits inside it solid — so the month reads as
 * unfinished rather than as bad, which is what a single bar cut off partway
 * through inevitably looked like.
 */
function MonthBar(props: RectangleProps & { payload?: GoalTrendChartData }) {
  const { payload, ...rect } = props;

  // Months that have not happened yet get no bar at all. A month that has
  // started always gets one, rated or not — monthlyActual is what separates the
  // two, since performance is null in both cases.
  const actual = payload?.monthlyActual;
  if (actual === null || actual === undefined) return <g />;

  const performance = payload?.performance;
  const color = performance ? PERFORMANCE_COLOR[performance] : PENDING_COLOR;

  const x = Number(rect.x ?? 0);
  const y = Number(rect.y ?? 0);
  const width = Number(rect.width ?? 0);
  const height = Number(rect.height ?? 0);

  const projected = payload?.projectedMonthly;
  // The bar spans 0..projected, so the completed share of it is the same share
  // of its height. Guarded because a month with nothing in it has no height.
  const completedRatio = projected && projected > 0 ? Math.min(1, actual / projected) : 1;
  const completedHeight = height * completedRatio;

  const showProjection =
    !!payload?.isInProgress && projected !== null && height - completedHeight > 0.5;

  return (
    <g>
      {showProjection ? (
        <>
          <Rectangle
            {...rect}
            fill={color}
            fillOpacity={PROJECTION_OPACITY}
            radius={[8, 8, 0, 0]}
          />
          <Rectangle
            x={x}
            y={y + height - completedHeight}
            width={width}
            height={completedHeight}
            fill={color}
            radius={[0, 0, 0, 0]}
          />
        </>
      ) : (
        <Rectangle {...rect} fill={color} radius={[8, 8, 0, 0]} />
      )}
      {payload?.isBestMonth && (
        <BestMonthBadge cx={x + width / 2} cy={y - BADGE_GAP - BADGE_RADIUS} />
      )}
    </g>
  );
}

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
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        {dataPoint.month}
        {dataPoint.isInProgress && (
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>
            · in progress, day {dataPoint.dayOfMonth} of {dataPoint.daysInMonth}
          </span>
        )}
        {dataPoint.isBestMonth && (
          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-muted)" }}>
            ★ Best month
          </span>
        )}
      </div>

      {dataPoint.monthlyActual !== null && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          {dataPoint.isInProgress ? "So far:" : "Actual:"}{" "}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {formatValue(dataPoint.monthlyActual)}
          </span>
          {!dataPoint.isInProgress && dataPoint.performance && (
            <span
              style={{
                marginLeft: 6,
                color: PERFORMANCE_COLOR[dataPoint.performance],
                fontWeight: 600,
              }}
            >
              {PERFORMANCE_LABEL[dataPoint.performance]}
            </span>
          )}
        </div>
      )}

      {/* The rating belongs to the projection for a running month, so it is
          shown on the line the rating actually refers to. */}
      {dataPoint.isInProgress && dataPoint.projectedMonthly !== null && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          At this pace:{" "}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {formatValue(dataPoint.projectedMonthly)}
          </span>
          {dataPoint.performance && (
            <span
              style={{
                marginLeft: 6,
                color: PERFORMANCE_COLOR[dataPoint.performance],
                fontWeight: 600,
              }}
            >
              {PERFORMANCE_LABEL[dataPoint.performance]}
            </span>
          )}
        </div>
      )}

      {/* Too early to extrapolate: a fortnight's worth of nothing is not the
          same claim as "this month ends at nothing", and one big day early on
          is not a month of them either. */}
      {dataPoint.isInProgress && dataPoint.projectedMonthly === null && (
        <div style={{ fontSize: 12, color: PENDING_COLOR, fontWeight: 600, marginBottom: 4 }}>
          Too early in the month to rate
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
        Required Ø/Month:{" "}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>
          {formatValue(dataPoint.requiredAvgMonthly)}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Current Ø/Month:{" "}
        <span
          style={{
            color: dataPoint.isOnTrack ? "var(--chart-on-target)" : "var(--chart-below)",
            fontWeight: 600,
          }}
        >
          {formatValue(dataPoint.actualAvgMonthly)}
        </span>
      </div>
    </div>
  );
}

function LineSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="20" height="10" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line
        x1="1"
        y1="5"
        x2="19"
        y2="5"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

function BarSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 10,
        height: 10,
        borderRadius: 3,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {swatch}
      {children}
    </span>
  );
}

const legendRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px 14px",
};

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

  // The averages and bounds are the same on every point — read them off the first.
  const firstDataPoint = data[0];
  const requiredAvgMonthly = firstDataPoint?.requiredAvgMonthly ?? 0;
  const requiredLowerBound = firstDataPoint?.requiredLowerBound ?? 0;
  const requiredUpperBound = firstDataPoint?.requiredUpperBound ?? 0;
  const actualAvgMonthly = firstDataPoint?.actualAvgMonthly ?? 0;
  const isOnTrack = firstDataPoint?.isOnTrack ?? false;

  // The current-average line wears the same rating colour the bars use, so the
  // legend's colour key holds for the line as well.
  const actualLineColor = isOnTrack ? "var(--chart-on-target)" : "var(--chart-below)";

  const bestMonth = data.find((point) => point.isBestMonth);
  const runningMonth = data.find((point) => point.isInProgress && point.monthlyActual !== null);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 36, right: 16, left: 16, bottom: 4 }}
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

            {/* Monthly bars, coloured by how the month rates against the required average */}
            <Bar
              dataKey="barTop"
              name="Actual"
              shape={<MonthBar />}
              isAnimationActive={false}
            />

            {/* Reference lines sit on top of the bars so both stay readable */}
            <Line
              type="linear"
              dataKey="requiredAvgMonthly"
              name="Required Ø/Month"
              stroke={REQUIRED_LINE_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="actualAvgMonthly"
              name="Current Ø/Month"
              stroke={actualLineColor}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 12,
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        <div style={legendRowStyle}>
          <LegendItem swatch={<LineSwatch color={actualLineColor} />}>
            Current Ø · {formatValue(actualAvgMonthly)}/Month
          </LegendItem>
          <LegendItem swatch={<LineSwatch color={REQUIRED_LINE_COLOR} dashed />}>
            Required Ø · {formatValue(requiredAvgMonthly)}/Month
          </LegendItem>
        </div>

        <div style={legendRowStyle}>
          <LegendItem swatch={<BarSwatch color={PERFORMANCE_COLOR.below} />}>
            Below Ø (&lt; {formatValue(requiredLowerBound)})
          </LegendItem>
          <LegendItem swatch={<BarSwatch color={PERFORMANCE_COLOR.onTarget} />}>
            On Ø ({formatValue(requiredLowerBound)} – {formatValue(requiredUpperBound)})
          </LegendItem>
          <LegendItem swatch={<BarSwatch color={PERFORMANCE_COLOR.above} />}>
            Above Ø (&gt; {formatValue(requiredUpperBound)})
          </LegendItem>
        </div>

        {runningMonth && (
          <div style={legendRowStyle}>
            <LegendItem
              swatch={
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: runningMonth.performance
                      ? PERFORMANCE_COLOR[runningMonth.performance]
                      : PENDING_COLOR,
                    opacity: runningMonth.performance ? PROJECTION_OPACITY : 1,
                    flexShrink: 0,
                  }}
                />
              }
            >
              {runningMonth.performance
                ? `${runningMonth.month} is still running — solid is done, pale is where it lands at this pace`
                : `${runningMonth.month} has only just started — shown, but too early to rate`}
            </LegendItem>
          </div>
        )}

        {bestMonth && bestMonth.monthlyActual !== null && (
          <div style={legendRowStyle}>
            <LegendItem
              swatch={
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "var(--pill-active-bg)",
                    color: "#ffffff",
                    fontSize: 10,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  ★
                </span>
              }
            >
              Best month · {bestMonth.month} ({formatValue(bestMonth.monthlyActual)})
            </LegendItem>
          </div>
        )}
      </div>
    </div>
  );
}
