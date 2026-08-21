export const directionOptions = [
  ["Quant", "Quant"],
  ["AI/ML", "AI / ML"],
  ["ML Systems", "ML Systems"],
  ["SWE/Data Infra", "SWE / Data Infra"],
];

export const directionLabels = Object.fromEntries(directionOptions);
export const canonicalDirections = directionOptions.map(([value]) => value);

/**
 * Direction filters intentionally use exact canonical tags. Resume selection,
 * employer industry, and free-form search text must not broaden this match.
 *
 * @param {string[]} directions
 * @param {string} selectedDirection
 */
export function jobMatchesDirection(directions, selectedDirection) {
  return (
    selectedDirection === "all" || directions.includes(selectedDirection)
  );
}

/**
 * Keep the detail pane inside the filtered result set. This prevents a job
 * selected under an earlier filter from remaining visible after filters change.
 *
 * @template {{id: string}} T
 * @param {T[]} filteredJobs
 * @param {string} selectedId
 * @returns {T | undefined}
 */
export function selectVisibleJob(filteredJobs, selectedId) {
  return (
    filteredJobs.find((job) => job.id === selectedId) ?? filteredJobs[0]
  );
}
