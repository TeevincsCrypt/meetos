import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, differenceInCalendarDays } from 'date-fns';

export function fmtDate(ms: number | null | undefined, withYear = false): string {
  if (!ms) return '—';
  return format(ms, withYear ? 'MMM d, yyyy' : 'MMM d');
}

export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return format(ms, 'MMM d, yyyy · h:mm a');
}

export function fmtRelative(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (Math.abs(Date.now() - ms) < 60_000) return 'just now';
  return formatDistanceToNowStrict(ms, { addSuffix: true });
}

export function fmtDue(ms: number | null | undefined): string {
  if (!ms) return 'No deadline';
  if (isToday(ms)) return 'Due today';
  if (isTomorrow(ms)) return 'Due tomorrow';
  if (isYesterday(ms)) return 'Due yesterday';
  const d = differenceInCalendarDays(ms, Date.now());
  if (d < 0) return `${-d} days overdue`;
  if (d < 7) return `Due ${format(ms, 'EEEE')}`;
  return `Due ${format(ms, 'MMM d')}`;
}

export function toDateInput(ms: number | null | undefined): string {
  return ms ? format(ms, 'yyyy-MM-dd') : '';
}

export function toDateTimeInput(ms: number | null | undefined): string {
  return ms ? format(ms, "yyyy-MM-dd'T'HH:mm") : '';
}

/** <input type="date"> value -> end of that local day (deadlines are due end-of-day). */
export function fromDateInput(v: string): number | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59).getTime();
}

export function fromDateTimeInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
