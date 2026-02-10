const SUFFIXES: [number, string][] = [
  [1_000_000_000_000, "T"],
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

export function formatCompactNumber(value: number | string, decimals = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";

  for (const [threshold, suffix] of SUFFIXES) {
    if (Math.abs(num) >= threshold) {
      const scaled = num / threshold;
      const formatted = scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(decimals);
      return `${formatted}${suffix}`;
    }
  }

  return num.toLocaleString();
}
