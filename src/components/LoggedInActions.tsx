import { loadToken, clearToken } from "../repositories/tokenRepository";

type Props = {
  onLoggedOut: () => void;
};

export default function LoggedInActions({ onLoggedOut }: Props) {
  return (
    <div className="d-flex gap-12 mt-12 flex-wrap">
      <button
        onClick={async () => {
          await clearToken();
          onLoggedOut();
        }}
        style={{
          padding: "12px 20px",
          fontSize: "16px",
          borderRadius: "8px",
          border: "none",
          backgroundColor: "#999",
          color: "white",
          cursor: "pointer",
        }}
      >
        Logout
      </button>

      <button
        onClick={async () => {
          const tokenData = await loadToken();
          if (!tokenData) return;

          const res = await fetch("https://www.strava.com/api/v3/athlete", {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          });

          const data = await res.json();
          console.log("Athlete:", data);
          //alert("Athlete loaded. Check console.");
        }}
        style={{
          padding: "12px 20px",
          fontSize: "16px",
          borderRadius: "8px",
          border: "none",
          backgroundColor: "#1976d2",
          color: "white",
          cursor: "pointer",
        }}
      >
        Test Strava API
      </button>
    </div>
  );
}
