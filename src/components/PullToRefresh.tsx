/**
 * PullToRefresh Component
 *
 * Lightweight mobile-first pull-to-refresh implementation using native body scroll.
 * Only activates when user pulls down from the very top (window.scrollY === 0).
 *
 * Usage:
 *   <PullToRefresh onRefresh={async () => { await refetchData(); }}>
 *     <YourContent />
 *   </PullToRefresh>
 *
 * Features:
 * - Touch/pointer events only (ignores mouse/wheel)
 * - Small fixed indicator at top with safe-area support
 * - Smooth animations via CSS transform and RAF
 * - Prevents double-triggering during refresh
 * - Handles errors gracefully
 */

import { useEffect, useRef, useState } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  enabled?: boolean;
  thresholdPx?: number;
  maxPullPx?: number;
  children: React.ReactNode;
}

type RefreshState = "idle" | "pulling" | "refreshing" | "error";

export default function PullToRefresh({
  onRefresh,
  enabled = true,
  thresholdPx = 50,
  maxPullPx = 100,
  children,
}: PullToRefreshProps) {
  const [state, setState] = useState<RefreshState>("idle");
  const [pullDistance, setPullDistance] = useState(0);

  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const isPullingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const scrollStartYRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(e: PointerEvent | TouchEvent) {
      console.log("[PTR] Down:", {
        type: e instanceof PointerEvent ? "pointer" : "touch",
        pointerType: e instanceof PointerEvent ? e.pointerType : "n/a",
        scrollY: window.scrollY,
        state,
      });

      // In Chrome DevTools device mode, accept any pointer type for testing
      // In production, you might want: if (e instanceof PointerEvent && e.pointerType === "mouse") return;

      // Must be at top of page
      if (window.scrollY !== 0) {
        console.log("[PTR] Not at top, scrollY:", window.scrollY);
        return;
      }

      // Don't start new pull while refreshing
      if (state === "refreshing") {
        console.log("[PTR] Already refreshing");
        return;
      }

      const clientY =
        e instanceof TouchEvent ? e.touches[0]?.clientY : e.clientY;
      if (clientY === undefined) return;

      console.log("[PTR] Starting pull at Y:", clientY);
      startYRef.current = clientY;
      currentYRef.current = clientY;
      scrollStartYRef.current = window.scrollY;
    }

    function handlePointerMove(e: PointerEvent | TouchEvent) {
      // Only track if we started from top
      if (scrollStartYRef.current !== 0) return;

      // Check if still at top
      if (window.scrollY > 0) {
        // User scrolled down; cancel pull
        if (isPullingRef.current) {
          console.log("[PTR] Canceling pull, scrolled");
          cancelPull();
        }
        return;
      }

      // Accept any pointer type in dev mode (see handlePointerDown)

      const clientY =
        e instanceof TouchEvent
          ? e.changedTouches[0]?.clientY
          : e.clientY;
      if (clientY === undefined) return;

      const delta = clientY - startYRef.current;

      // Only start pulling if dragging down
      if (delta > 5 && !isPullingRef.current) {
        console.log("[PTR] Starting pull, delta:", delta);
        isPullingRef.current = true;
        setState("pulling");

        // Prevent default to stop overscroll/bounce during pull
        e.preventDefault();
      }

      if (isPullingRef.current) {
        currentYRef.current = clientY;

        // Update pull distance with RAF
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
          const rawDelta = currentYRef.current - startYRef.current;
          // Apply resistance curve: diminishing returns as you pull further
          const resistance = 0.55;
          const distance = Math.min(
            Math.pow(rawDelta, resistance) * 2.5,
            maxPullPx
          );
          setPullDistance(Math.max(0, distance));
        });

        e.preventDefault();
      }
    }

    function handlePointerUp(e: PointerEvent | TouchEvent) {
      if (!isPullingRef.current) return;

      console.log("[PTR] Up:", { pullDistance, threshold: thresholdPx });

      const shouldRefresh = pullDistance >= thresholdPx;

      if (shouldRefresh && state !== "refreshing") {
        console.log("[PTR] Triggering refresh!");
        setState("refreshing");
        setPullDistance(thresholdPx); // Lock indicator at threshold

        onRefresh()
          .then(() => {
            console.log("[PTR] Refresh complete");
            setState("idle");
            animatePullDistanceToZero();
          })
          .catch((error) => {
            console.error("[PTR] Refresh error:", error);
            setState("error");
            // Show error for 2 seconds
            setTimeout(() => {
              setState("idle");
              animatePullDistanceToZero();
            }, 2000);
          });
      } else {
        console.log("[PTR] Not enough distance, canceling");
        setState("idle");
        animatePullDistanceToZero();
      }

      isPullingRef.current = false;
    }

    function cancelPull() {
      isPullingRef.current = false;
      setState("idle");
      animatePullDistanceToZero();
    }

    function animatePullDistanceToZero() {
      // Smooth transition back to 0
      const start = pullDistance;
      const duration = 300;
      const startTime = performance.now();

      function animate(time: number) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        setPullDistance(start * (1 - eased));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setPullDistance(0);
        }
      }

      requestAnimationFrame(animate);
    }

    // Event listeners
    // Use passive: false to allow preventDefault during pull
    const options = { passive: false };

    window.addEventListener("touchstart", handlePointerDown, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, options);
    window.addEventListener("touchend", handlePointerUp, { passive: true });

    // Pointer events as fallback/complement
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, options);
    window.addEventListener("pointerup", handlePointerUp, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled, state, pullDistance, thresholdPx, maxPullPx, onRefresh]);

  // Calculate indicator properties
  const indicatorHeight = 50;
  const indicatorY = Math.min(pullDistance, indicatorHeight) - indicatorHeight;

  // Rotation for spinner (0 to 360 degrees based on pull)
  const spinnerRotation =
    state === "refreshing"
      ? 0 // Will use CSS animation
      : (pullDistance / thresholdPx) * 360;

  // Debug: log state changes
  useEffect(() => {
    console.log("[PTR] State changed:", state, "Distance:", pullDistance);
  }, [state, pullDistance]);

  return (
    <>
      {/* Pull-to-refresh indicator */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: `${indicatorHeight}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          paddingTop: "env(safe-area-inset-top)",
          transform: `translateY(${indicatorY}px)`,
          transition: state === "idle" ? "transform 0.3s ease-out" : "none",
          pointerEvents: "none",
          backgroundColor: "rgba(36, 36, 36, 0.9)",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            border: "4px solid rgba(100, 108, 255, 0.3)",
            borderTopColor: "#646cff",
            borderRadius: "50%",
            transform: `rotate(${spinnerRotation}deg)`,
            animation: state === "refreshing" ? "ptr-spin 0.8s linear infinite" : "none",
            transition: state === "pulling" ? "none" : "transform 0.2s ease-out",
          }}
        />
        {state === "error" && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#ff6b6b",
              fontSize: "12px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              background: "var(--bg, #242424)",
              padding: "4px 8px",
              borderRadius: "4px",
            }}
          >
            Refresh failed
          </div>
        )}
      </div>

      {/* Content */}
      {children}

      {/* Debug indicator - shows current state */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            bottom: "10px",
            right: "10px",
            padding: "8px 12px",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "#fff",
            fontSize: "11px",
            borderRadius: "4px",
            zIndex: 10000,
            fontFamily: "monospace",
            pointerEvents: "none",
          }}
        >
          PTR: {state} | {Math.round(pullDistance)}px
        </div>
      )}

      {/* Keyframes for spinner */}
      <style>{`
        @keyframes ptr-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
