import { getActivityProviderId } from "../data/providerRegistry";

/**
 * Credits whoever actually supplied the numbers on screen.
 *
 * Follows the selected provider rather than being hard-coded: with
 * `?provider=strava` the app still renders years out of the Strava cache, and
 * Strava's API terms ask for their attribution wherever their data is shown.
 * A footer that says "Runalyze" over Strava data would be wrong in both
 * directions.
 */
export default function DataAttribution() {
  const provider = getActivityProviderId();

  const linkStyle = { color: "var(--text-muted)", textDecoration: "underline" } as const;

  if (provider === "strava") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <img src="/icons/strava-logo.svg" alt="Strava" style={{ height: "1rem" }} />
        data provided by{" "}
        <a href="https://strava.com" style={linkStyle}>
          Strava®
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      data provided by{" "}
      <a href="https://runalyze.com" style={linkStyle}>
        Runalyze
      </a>
    </div>
  );
}
