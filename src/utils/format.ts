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
