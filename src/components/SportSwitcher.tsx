import type { Sport } from "../domain/metrics/types";
import RunningIcon from "./icons/RunningIcon";
import CyclingIcon from "./icons/CyclingIcon";
import SwimmingIcon from "./icons/SwimmingIcon";

type Props = {
  value: Sport;
  onChange: (sport: Sport) => void;
};

export default function SportSwitcher({ value, onChange }: Props) {

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

        {/* Swimming */}
        <input
          className="segmented__input"
          type="radio"
          name="sport"
          id="sport-swimming"
          checked={value === "swim"}
          onChange={() => onChange("swim")}
        />
        <label className="segmented__option" htmlFor="sport-swimming">
          <SwimmingIcon />
          <span>Swimming</span>
        </label>
      </div>
    </section>
  );
}
