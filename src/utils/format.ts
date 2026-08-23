export type FormatNumberOptions = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  useGrouping?: boolean;
  locale?: string;
};

export function formatNumber(value: number, options: FormatNumberOptions = {}): string {
  const {
    maximumFractionDigits = 0,
    minimumFractionDigits = 0,
    useGrouping = false,
    locale = "en-US",
  } = options;

  return value.toLocaleString(locale, {
    useGrouping,
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

export type FormatDateOptions = {
  locale?: string;
};

/**
 * A date as the rest of the interface writes them: "Jan 13, 2027".
 *
 * `toDateString()` was doing this before and produced "Wed Jan 13 2027" — a
 * fixed C-library format that names a weekday nobody asked for, and the only
 * place in the app not going through Intl. The year is always shown because
 * every date rendered this way is a projection, and projections routinely land
 * in the next one.
 */
export function formatDate(date: Date, options: FormatDateOptions = {}): string {
  const { locale = "en-US" } = options;

  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
