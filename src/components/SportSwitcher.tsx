import { useEffect, useState } from "react";
import type { Sport } from "../domain/metrics/types";

type Props = {
  value: Sport;
  onChange: (sport: Sport) => void;
};

export default function SportSwitcher({ value, onChange }: Props) {
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 1800);
    return () => window.clearTimeout(t);
  }, [hint]);

  function comingSoon() {
    setHint("Hiking kommt später 🙂");
  }

  return (
    <section className="sport-switcher" aria-label="Sport selection">
      <div className="segmented" role="radiogroup" aria-label="Select sport">
        {/* Running */}
        <input
          className="segmented__input"
          type="radio"
          name="sport"
          id="sport-running"
          checked={value === "run"}
          onChange={() => onChange("run")}
        />
        <label className="segmented__option" htmlFor="sport-running">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M13.5 5.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Zm-3.3 6 2.2-1.1 2.3 1.3 1.5 2.2h2.4v2h-3.4l-1.3-2-1.5-.8-1.6 2.6 1.8 1.7 2.5.7-.5 2-3.2-.9-2.6-2.4-2 3.2H5v-2h1.4l3.8-6.3Z"
              fill="currentColor"
            />
          </svg>
          <span>Running</span>
        </label>

        {/* Cycling */}
        <input
          className="segmented__input"
          type="radio"
          name="sport"
          id="sport-cycling"
          checked={value === "ride"}
          onChange={() => onChange("ride")}
        />
        <label className="segmented__option" htmlFor="sport-cycling">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M16.5 5.3a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2ZM8.2 11h3.3l1.7 2.6h-2L10 12.1H8.9l2 3H14a4.5 4.5 0 1 1-.7 2H10a4.5 4.5 0 1 1-1.8-6.1ZM6.5 17.1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm13 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
              fill="currentColor"
            />
          </svg>
          <span>Cycling</span>
        </label>

        {/* Hiking (clickable → shows hint, does NOT change sport) */}
        <input
          className="segmented__input"
          type="radio"
          name="sport"
          id="sport-hiking"
          checked={false}
          onChange={comingSoon}
        />
        <label
          className="segmented__option"
          htmlFor="sport-hiking"
          onClick={(e) => {
            // ensure label click also triggers hint
            e.preventDefault();
            comingSoon();
          }}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9.5 4.7a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Zm4.1 5.9 1.9 1.2 1 3.5h2.5v2h-4l-1.1-3.8-1-.6-1.1 2.5 1.5 1.5.6 3.4-2 .3-.6-3.1-2-2L7 20H4.8v-2h1l3.8-6.6 2-1.2Z"
              fill="currentColor"
            />
          </svg>
          <span>Hiking</span>
        </label>
      </div>

      {/* tiny toast/hint */}
      {hint && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(0,0,0,0.65)",
            color: "white",
            fontSize: 13,
            width: "fit-content",
            maxWidth: "100%",
          }}
        >
          {hint}
        </div>
      )}
    </section>
  );
}
