export function parseEpisodeNumbers(value: string): number[] {
  const parsed = value
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isInteger(num) && num > 0);
  return [...new Set(parsed)];
}
