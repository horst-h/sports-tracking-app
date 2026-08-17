import type { ReactNode } from "react";
import { Flag } from "lucide-react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { MONTH_LABELS } from "../../utils/goalTrendChartHelper";

export type GoalForecastChartPoint = {
  month: string;
  monthIndex: number;
  /** Cumulative total up to this month; null once the year runs past today. */
  cumulativeActual: number | null;
  /** Linear projection from today onward; null before the handover and for finished years. */
  cumulativeForecast: number | null;
};

export type GoalCrossing = {
  /** Fractional month index, so the marker can sit between two months. */
  x: number;
  date: Date;
  /** false once the goal has actually been passed. */
  isProjection: boolean;
};

export type GoalForecastChart = {
  points: GoalForecastChartPoint[];
  goal: number;
  ytd: number;
  /** null for a year that is already over — nothing left to project. */
  forecastEoy: number | null;
  /** null when the year is not projected to reach the goal at all. */
  goalCrossing: GoalCrossing | null;
  reachesGoal: boolean;
};

type Props = {
  chart: GoalForecastChart;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
};

const GOAL_LINE_COLOR = "var(--chart-reference)";

const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * Axis top and ticks for a range that has to cover a given value.
 *
 * The goal has to stay on screen, and pinning the axis to it directly produces
 * ticks off the goal itself (0, 300, 600, 1155). Rounding the step up to a nice
 * number first keeps the goal inside and the labels readable.
 */
function niceAxis(required: number, intervals = 4): { max: number; ticks: number[] } {
  if (!(required > 0)) return { max: 1, ticks: [0, 1] };

  const rawStep = required / intervals;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (NICE_STEPS.find((candidate) => normalized <= candidate) ?? 10) * magnitude;
  const stepCount = Math.ceil(required / step);

  const ticks: number[] = [];
  for (let i = 0; i <= stepCount; i++) {
    ticks.push(i * step);
  }
  return { max: stepCount * step, ticks };
}

function CustomTooltip({
  active,
  payload,
  goal,
  formatValue,
}: TooltipProps<number, string> & { goal: number; formatValue: (value: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as GoalForecastChartPoint | undefined;
  if (!point) return null;

  const actual = point.cumulativeActual;
  // On the handover month both series carry the same value — don't say it twice.
  const forecast = actual === null ? point.cumulativeForecast : null;
  const shown = actual ?? point.cumulativeForecast;
  if (shown === null) return null;

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
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{point.month}</div>

      {actual !== null && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          Progress:{" "}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatValue(actual)}</span>
        </div>
      )}

      {forecast !== null && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          Forecast:{" "}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{formatValue(forecast)}</span>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Of goal:{" "}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>
          {goal > 0 ? Math.round((shown / goal) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}

/** Headroom above the plot, where the goal marker's date label sits. */
const CHART_MARGIN_TOP = 26;

const GOAL_ICON_SIZE = 13;
/** Rough advance width of the bold 11px label font — enough to centre a short date. */
const GOAL_LABEL_CHAR_WIDTH = 6.3;

/**
 * Date the goal is met, flagged so the marker says what it marks without
 * needing the legend. Recharts hands a vertical ReferenceLine's label the line
 * itself as its viewBox, so x is the line and y its top end.
 *
 * `side` moves the whole group to one side of the line instead of straddling
 * it. Centred is what reads best, but a crossing in the first or last weeks of
 * the year would hang the label over the chart's edge.
 */
function GoalDateLabel({
  viewBox,
  text,
  side = "center",
}: {
  viewBox?: { x?: number; y?: number };
  text: string;
  side?: "left" | "center" | "right";
}) {
  const lineX = Number(viewBox?.x);
  const lineTop = Number(viewBox?.y);
  if (!Number.isFinite(lineX) || !Number.isFinite(lineTop)) return null;

  const baseline = lineTop - 6;
  const groupWidth = GOAL_ICON_SIZE + 3 + text.length * GOAL_LABEL_CHAR_WIDTH;
  const iconX =
    side === "left"
      ? lineX - groupWidth - 4
      : side === "right"
        ? lineX + 4
        : lineX - groupWidth / 2;

  return (
    <g>
      <g transform={`translate(${iconX}, ${baseline - GOAL_ICON_SIZE + 2})`}>
        <Flag size={GOAL_ICON_SIZE} color={GOAL_LINE_COLOR} strokeWidth={2.5} />
      </g>
      <text
        x={iconX + GOAL_ICON_SIZE + 3}
        y={baseline}
        fontSize={11}
        fontWeight={700}
        fill={GOAL_LINE_COLOR}
      >
        {text}
      </text>
    </g>
  );
}

/** Marks the value the projection ends on, anchored right so it never runs off the chart. */
function ForecastEndLabel({
  x,
  y,
  index,
  value,
  lastIndex,
  color,
  format,
}: {
  x?: number | string;
  y?: number | string;
  index?: number;
  value?: number | string;
  lastIndex: number;
  color: string;
  format: (value: number) => string;
}) {
  if (index !== lastIndex || typeof value !== "number") return null;

  const cx = Number(x);
  const cy = Number(y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  // A projection that ends just under the axis top would put this label in the
  // headroom the goal marker's date already occupies — drop below the point
  // instead. Both only ever compete when the goal is met in late December.
  const clearsDateLabel = cy - CHART_MARGIN_TOP >= 28;

  return (
    <g>
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
      {/* Painted over its own white outline: on narrow charts the goal marker
          and the grid run straight through where this label sits. */}
      <text
        x={cx}
        y={clearsDateLabel ? cy - 11 : cy + 16}
        textAnchor="end"
        fontSize={11}
        fontWeight={700}
        fill={color}
        stroke="var(--surface)"
        strokeWidth={3.5}
        style={{ paintOrder: "stroke" }}
      >
        {format(value)}
      </text>
    </g>
  );
}

function LineSwatch({
  color,
  dashArray,
}: {
  color: string;
  dashArray?: string;
}) {
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
        strokeDasharray={dashArray}
      />
    </svg>
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

export default function GoalForecastChartCore({ chart, formatValue, formatTick }: Props) {
  const { points, goal, ytd, forecastEoy, goalCrossing, reachesGoal } = chart;

  if (!points || points.length === 0) {
    return (
      <div className="text-muted" style={{ marginTop: 16 }}>
        No data for this period.
      </div>
    );
  }

  // Progress and forecast are the same series, so they share a hue and are told
  // apart by line style. The hue reports whether the projection lands on the goal.
  const progressColor = reachesGoal ? "var(--chart-on-target)" : "var(--chart-below)";

  const dataMax = points.reduce(
    (max, point) => Math.max(max, point.cumulativeActual ?? 0, point.cumulativeForecast ?? 0),
    0,
  );
  // Nudge the goal up a little so its line never lands on the very top edge.
  const axis = niceAxis(Math.max(dataMax, goal * 1.02));

  // Built from the axis' own month names rather than from the browser locale, so
  // the marker reads in the same language as the ticks it sits between.
  const crossingDate = goalCrossing
    ? `${goalCrossing.date.getDate()} ${MONTH_LABELS[goalCrossing.date.getMonth()]}`
    : null;

  // A crossing in the closing or opening weeks of the year leaves no room for a
  // centred label. The month index says which edge it is near without needing
  // the plot's pixel bounds, which the label renderer never sees.
  const crossingLabelSide =
    goalCrossing == null
      ? "center"
      : goalCrossing.x > 10.3
        ? "left"
        : goalCrossing.x < 0.7
          ? "right"
          : "center";

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: CHART_MARGIN_TOP, right: 16, left: 16, bottom: 4 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            {/* Numeric rather than category, so the goal marker can stand between
                two months instead of snapping to the nearest one. */}
            <XAxis
              dataKey="monthIndex"
              type="number"
              domain={[0, 11]}
              ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}
              tickFormatter={(value: number) => MONTH_LABELS[value] ?? ""}
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
              width={48}
              // A year that stays far below its goal would otherwise scale the
              // axis to the data alone and push the goal line off the chart.
              domain={[0, axis.max]}
              ticks={axis.ticks}
              style={{ fontSize: 11, fill: "var(--text-muted)" }}
            />
            <Tooltip
              content={<CustomTooltip goal={goal} formatValue={formatValue} />}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            />

            <ReferenceLine
              y={goal}
              stroke={GOAL_LINE_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
            />

            {goalCrossing && (
              <ReferenceLine
                x={goalCrossing.x}
                stroke={GOAL_LINE_COLOR}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={<GoalDateLabel text={crossingDate ?? ""} side={crossingLabelSide} />}
              />
            )}

            <Line
              type="monotone"
              dataKey="cumulativeForecast"
              name="Forecast"
              stroke={progressColor}
              strokeWidth={2}
              strokeDasharray="2 5"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="cumulativeForecast"
                content={
                  <ForecastEndLabel
                    lastIndex={points.length - 1}
                    color={progressColor}
                    format={formatValue}
                  />
                }
              />
            </Line>
            <Line
              type="monotone"
              dataKey="cumulativeActual"
              name="Progress"
              stroke={progressColor}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px 14px",
          marginTop: 12,
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        <LegendItem swatch={<LineSwatch color={progressColor} />}>
          Progress · {formatValue(ytd)}
        </LegendItem>
        {forecastEoy !== null && (
          <LegendItem swatch={<LineSwatch color={progressColor} dashArray="2 5" />}>
            Forecast Dec · {formatValue(forecastEoy)}
          </LegendItem>
        )}
        <LegendItem swatch={<LineSwatch color={GOAL_LINE_COLOR} dashArray="5 4" />}>
          Goal · {formatValue(goal)}
        </LegendItem>
        {/* Stated either way: without this line, a year that never reaches its
            goal is only signalled by a marker that isn't there. */}
        <LegendItem
          swatch={
            <Flag
              size={13}
              color={goalCrossing ? GOAL_LINE_COLOR : "var(--text-light)"}
              strokeWidth={2.5}
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            />
          }
        >
          {goalCrossing ? (
            <>
              {goalCrossing.isProjection ? "Goal date · " : "Goal reached · "}
              {crossingDate}
              {goalCrossing.isProjection && " (projected)"}
            </>
          ) : (
            "Goal date · not this year"
          )}
        </LegendItem>
      </div>
    </div>
  );
}
