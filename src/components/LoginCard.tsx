import { useEffect, useRef, useState } from "react";
import { mountGoogleSignIn } from "../services/googleAuth";
import type { GoogleSession } from "../repositories/googleSessionRepository";

type Props = {
  onSignedIn?: (session: GoogleSession) => void;
};

export default function LoginCard({ onSignedIn }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = buttonRef.current;
    if (!target) return;

    let cancelled = false;

    void mountGoogleSignIn(
      target,
      (session) => {
        if (cancelled) return;
        // Without a handler, fall back to a reload: the session is already in
        // IndexedDB at this point, so the next load picks it up.
        if (onSignedIn) onSignedIn(session);
        else window.location.reload();
      },
      (message) => {
        if (!cancelled) setError(message);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        padding: "1rem",
      }}
    >
      <div className="card card--primary" style={{ maxWidth: "400px", width: "100%" }}>
        <div className="card__body">
          <h1
            style={{
              marginTop: 0,
              marginBottom: "1rem",
              fontSize: "24px",
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            still moving
          </h1>

          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "16px",
              lineHeight: "1.6",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Sign in to see your activities and goals.
          </p>

          <div style={{ display: "flex", justifyContent: "center" }} ref={buttonRef} />

          {error && (
            <p
              style={{
                marginTop: "1rem",
                fontSize: "13px",
                color: "var(--text-error, #c00)",
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}

          <p
            style={{
              marginTop: "1rem",
              fontSize: "12px",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Your Google account is used to identify you, nothing else. Activities come
            from Runalyze.
          </p>
        </div>
      </div>
    </div>
  );
}
