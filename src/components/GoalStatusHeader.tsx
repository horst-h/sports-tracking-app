import { ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import type { GoalStatus } from "../domain/metrics/goalStatus";
import { getStatusStyles } from "../domain/metrics/goalStatus";

type Props = {
  statusLabel: string;
  status: GoalStatus | undefined;
  daysAhead?: number;
  children?: React.ReactNode; // Icons/buttons
};

/**
 * Reusable header component for goal cards.
 * 
 * Displays:
 * - Status-Pill (primary, filled)
 * - Delta text (secondary, under the pill) showing days ahead/behind
 * - Children (icons/buttons) to the right
 * 
 * Delta is secondary: only shown if daysAhead is not 0 and not undefined.
 * Styling: small text without background/border, with color indicator (green/orange/red).
 */
export default function GoalStatusHeader({ statusLabel, status, daysAhead, children }: Props) {
  const statusStyles = status
    ? getStatusStyles(status)
    : { pillClass: "bg-slate-100 text-slate-500 border-slate-200", barClass: "bg-slate-400" };

  /**
   * Ahead or behind is decided by the sign of the number, never by the status.
   *
   * Taking it from the status is how this rendered "-7.8 days ahead" under a
   * green pill: the branch was chosen by one input while the number came from
   * another, so a disagreement between them printed as a contradiction rather
   * than being impossible. The status now only picks the colour and the icon,
   * which is what it is actually qualified to say.
   *
   * Rounded before the zero check, so a delta that would display as "0 days" is
   * left out entirely instead of shown as an arrow pointing at nothing.
   */
  const days = typeof daysAhead === "number" ? Math.round(daysAhead) : 0;
  const showDelta = typeof daysAhead === "number" && days !== 0;

  const deltaText =
    days > 0
      ? `${days} days ahead`
      : status === "catch-up"
        ? `${Math.abs(days)} days to catch up`
        : `${Math.abs(days)} days behind`;

  const deltaColor =
    status === "off-track"
      ? "text-rose-600"
      : status === "catch-up"
        ? "text-amber-600"
        : "text-emerald-600";

  const DeltaIcon = days > 0 ? ArrowUp : status === "catch-up" ? ArrowRight : ArrowDown;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "nowrap",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {/* Status Pill + Delta (vertical stack) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
        <div
          className={`status-badge ${statusStyles.pillClass}`}
          aria-label={`Status: ${statusLabel}`}
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            padding: "4px 18px",
            borderRadius: "12px",
            border: "1px solid currentColor",
            opacity: 0.9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            minWidth: "130px",
          }}
        >
          <span>{statusLabel}</span>
        </div>

        {/* Delta subline (days ahead/behind) */}
        {showDelta && (
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: deltaColor,
              // No background, no border → purely text-based secondary info
            }}
            aria-label={deltaText}
          >
            {DeltaIcon && <DeltaIcon size={12} aria-hidden="true" />}
            <span>{deltaText}</span>
          </div>
        )}
      </div>

      {/* Icon buttons (Chart, Edit) */}
      {children}
    </div>
  );
}
