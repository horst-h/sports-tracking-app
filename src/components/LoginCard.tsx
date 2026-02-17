import { startStravaLogin } from "../services/auth";

export default function LoginCard() {
  const handleLogin = async () => {
    try {
      await startStravaLogin();
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed. Please try again.");
    }
  };

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
            Not authenticated
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
            Please sign in with Strava to continue and start tracking your activities.
          </p>

          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              padding: "0.75rem 1.5rem",
              fontSize: "16px",
              fontWeight: "600",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "var(--primary, #FC4C02)",
              color: "#fff",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.opacity = "1";
            }}
            aria-label="Login with Strava"
          >
            Login with Strava
          </button>

          <p
            style={{
              marginTop: "1rem",
              fontSize: "12px",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            This will redirect you to Strava's login page. We'll never share your credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
