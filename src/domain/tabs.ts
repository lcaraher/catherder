/** The requested tab when it is one of ids, else the fallback when it is, else the first id. */
export function pickTab(
  requested: string | string[] | undefined,
  ids: readonly string[],
  fallback: string,
): string {
  if (typeof requested === "string" && ids.includes(requested)) return requested;
  return ids.includes(fallback) ? fallback : ids[0];
}

/** Consecutive groups of perRow items; the last group may be shorter. */
export function tabRows<T>(items: readonly T[], perRow = 3): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
}
