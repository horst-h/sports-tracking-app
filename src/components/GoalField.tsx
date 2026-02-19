import { useState, useEffect, useRef } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  label: string;
  value: number | undefined;
  unit: string;
  helpText?: string;
  onSave: (value: number | undefined) => Promise<void>;
  /** Whether to accept decimal values (default: true for distance/elevation, false for count) */
  allowDecimal?: boolean;
};

/**
 * Goal input field with auto-save on blur.
 * Shows inline status (Saved/Saving.../Error).
 */
export default function GoalField({
  label,
  value,
  unit,
  helpText,
  onSave,
  allowDecimal = true,
}: Props) {
  const [inputValue, setInputValue] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastSavedValue = useRef<number | undefined>(value);
  const isMountedRef = useRef(true);
  const latestValueRef = useRef<string>("");

  useEffect(() => {
    const strVal = typeof value === "number" ? String(value) : "";
    setInputValue(strVal);
    latestValueRef.current = strVal;
    lastSavedValue.current = value;
  }, [value]);

  useEffect(() => {
    if (saveState === "saved" || saveState === "error") {
      const timer = setTimeout(() => {
        setSaveState("idle");
        setErrorMessage(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [saveState]);

  function parseValue(raw: string): number | undefined | null {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      return null;
    }

    return allowDecimal ? num : Math.round(num);
  }

  async function triggerSave(parsed: number | undefined | null, options?: { silent?: boolean }) {
    if (parsed === null) {
      if (!options?.silent) {
        setSaveState("error");
        setErrorMessage("Invalid number");
      }
      return;
    }

    if (parsed === lastSavedValue.current) {
      return;
    }

    if (!options?.silent) {
      setSaveState("saving");
      setErrorMessage(null);
    }

    try {
      await onSave(parsed);
      lastSavedValue.current = parsed;
      if (isMountedRef.current && !options?.silent) {
        setSaveState("saved");
      }
    } catch (err) {
      if (isMountedRef.current && !options?.silent) {
        setSaveState("error");
        setErrorMessage(err instanceof Error ? err.message : "Save failed");
      }
    }
  }

  async function handleBlur() {
    const parsed = parseValue(latestValueRef.current);
    await triggerSave(parsed);
  }

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      const parsed = parseValue(latestValueRef.current);
      void triggerSave(parsed, { silent: true });
    };
  }, [allowDecimal]);

  function getStatusElement() {
    if (saveState === "saving") {
      return <span className="goal-field__status goal-field__status--saving">Saving...</span>;
    }
    if (saveState === "saved") {
      return <span className="goal-field__status goal-field__status--saved">Saved</span>;
    }
    if (saveState === "error") {
      return <span className="goal-field__status goal-field__status--error">{errorMessage || "Error"}</span>;
    }
    return null;
  }

  return (
    <div className="goal-field">
      <div className="goal-field__input-row">
        <input
          type="number"
          inputMode="decimal"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            latestValueRef.current = e.target.value;
          }}
          onBlur={handleBlur}
          placeholder="--"
          min={0}
          step={allowDecimal ? "any" : "1"}
          className="goal-field__input"
          aria-label={`${label} goal`}
        />
        <span className="goal-field__unit">{unit}</span>
      </div>

      {helpText && <p className="goal-field__help">{helpText}</p>}

      <div className="goal-field__status-row">{getStatusElement()}</div>
    </div>
  );
}
