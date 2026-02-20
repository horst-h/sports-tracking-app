import { useEffect, useState } from "react";
import type { Sport } from "../domain/metrics/types";
import RunningIcon from "./icons/RunningIcon";
import CyclingIcon from "./icons/CyclingIcon";
import HikingIcon from "./icons/HikingIcon";

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
          <RunningIcon />
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
          <CyclingIcon />
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
          <HikingIcon />
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
