/** Show stored part numbers, and make historical duplicate numbers distinguishable. */
export function seriesPartLabel(parts: Array<{ seriesPosition: number | null }>, index: number): string {
  const position = parts[index]?.seriesPosition;
  if (position == null) return `Part ${index + 1}`;
  if (parts.some((part, i) => i !== index && part.seriesPosition === position)) {
    return `Part ${position} (entry ${index + 1})`;
  }
  return `Part ${position}`;
}