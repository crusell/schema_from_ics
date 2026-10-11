import type { Lesson } from './ics';
import { minutesOfDay } from './time';

export interface Placed {
  lesson: Lesson;
  /** Minutes from local midnight. */
  startMin: number;
  endMin: number;
  /** Column index within its overlap cluster, and cluster width. */
  col: number;
  cols: number;
}

/**
 * Assign columns to overlapping lessons so they sit side by side. Lessons that
 * transitively overlap form a cluster; within a cluster each lesson takes the
 * first free column, and all lessons in the cluster share the column count.
 */
export function layoutDay(lessons: Lesson[]): Placed[] {
  const timed = lessons
    .filter((l) => !l.allDay)
    .map((l) => ({
      lesson: l,
      startMin: minutesOfDay(l.start),
      endMin: endMinutes(l),
      col: 0,
      cols: 1,
    }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = cluster.reduce((m, p) => Math.max(m, p.col + 1), 1);
    for (const p of cluster) p.cols = cols;
    cluster = [];
  };

  for (const p of timed) {
    if (p.startMin >= clusterEnd) flush();
    // First column whose last lesson ended before this one starts.
    const colEnds: number[] = [];
    for (const q of cluster) colEnds[q.col] = Math.max(colEnds[q.col] ?? 0, q.endMin);
    let col = 0;
    while ((colEnds[col] ?? 0) > p.startMin) col++;
    p.col = col;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.endMin);
  }
  flush();
  return timed;
}

function endMinutes(l: Lesson): number {
  const end = minutesOfDay(l.end);
  // An event ending exactly at midnight (or crossing it) clamps to end of day.
  const start = minutesOfDay(l.start);
  if (end <= start) return 24 * 60;
  return end;
}

/** Hour bounds for a time axis covering all placed lessons. */
export function axisBounds(placed: Placed[], fallback = { start: 8, end: 16 }): { start: number; end: number } {
  if (placed.length === 0) return fallback;
  const minStart = Math.min(...placed.map((p) => p.startMin));
  const maxEnd = Math.max(...placed.map((p) => p.endMin));
  return {
    start: Math.min(fallback.start, Math.floor(minStart / 60)),
    end: Math.max(fallback.end, Math.ceil(maxEnd / 60)),
  };
}
