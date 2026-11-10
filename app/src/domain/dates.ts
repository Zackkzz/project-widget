export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Clamp month ends, avoiding JS's rollover (31 October + 4 months → 28 February). */
export function addMonths(value: string, months: number): string {
  if (!validDate(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
export function creatorDate(value: string): string {
  if (!validDate(value)) throw new Error('Invalid date.');
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** Creator uses the application's Sydney wall clock, independent of the browser timezone. */
export function sydneyNow(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
export function validDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && validDate(value.slice(0, 10))
  );
}
export function creatorDateTime(value: string): string {
  if (!validDateTime(value)) throw new Error('Invalid date and time.');
  return `${creatorDate(value.slice(0, 10))} ${value.slice(11)}:00`;
}
