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

  // Determine delta text, color, and icon based on status
  const showDelta = typeof daysAhead === "number" && daysAhead !== 0;
  let deltaText = "";
  let deltaColor = "";
  let DeltaIcon = null;

  if (showDelta) {
    // Use status to determine icon (more intuitive than just daysAhead)
    if (status === "on-track") {
      deltaText = `${daysAhead} days ahead`;
      deltaColor = "text-emerald-600";
      DeltaIcon = ArrowUp;
    } else if (status === "catch-up") {
      deltaText = `${Math.abs(daysAhead)} days to catch up`;
      deltaColor = "text-amber-600";
      DeltaIcon = ArrowRight;
    } else if (status === "off-track") {
      deltaText = `${Math.abs(daysAhead)} days behind`;
      deltaColor = "text-rose-600";
      DeltaIcon = ArrowDown;
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        flexWrap: "nowrap",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {/* Status Pill + Delta (vertical stack) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div
          className={`status-badge ${statusStyles.pillClass}`}
          aria-label={`Status: ${statusLabel}`}
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: "12px",
            border: "1px solid currentColor",
            opacity: 0.9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <span>{statusLabel}</span>
        </div>

        {/* Delta subline (days ahead/behind) */}
        {showDelta && (
          <div
            style={{
              fontSize: "0.75rem",
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
