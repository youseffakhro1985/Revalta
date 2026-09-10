/**
 * Delad diagrampalett byggd på designsystemets tokens
 * (petroleum/sand/ink enligt DESIGN_SYSTEM.md). Använd alltid dessa
 * i grafer och diagram i stället för hårdkodade hex-värden.
 */
export const CHART_COLORS = [
  "#29463f", // petroleum-800
  "#587f73", // petroleum-500
  "#a5c2b7", // petroleum-300
  "#ad9f89", // sand-500
  "#c6b9a5", // sand-400
  "#918a83", // ink-400
] as const;
