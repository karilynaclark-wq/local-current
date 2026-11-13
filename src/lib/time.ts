// Local Current runs on Chicago time everywhere, whatever the phone's time zone.

export const TZ = 'America/Chicago';

/** Chicago wall-clock parts for an instant. */
export function chicagoParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => Number(f.find(p => p.type === t)?.value ?? 0);
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour') % 24, min: g('minute') };
}

/** The instant when it is y-m-d h:min in Chicago (m is 1-12). Handles CST/CDT. */
export function chicagoInstant(y: number, m: number, d: number, h = 0, min = 0): Date {
  const target = Date.UTC(y, m - 1, d, h, min);
  let t = target + 6 * 3_600_000; // first guess: CST
  for (let i = 0; i < 2; i++) {
    const p = chicagoParts(new Date(t));
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    t += target - shown;
  }
  return new Date(t);
}

/** A calendar day picked in the app (local Date) at h:min Chicago time. */
export const chicagoOnDay = (day: Date, h = 0, min = 0) =>
  chicagoInstant(day.getFullYear(), day.getMonth() + 1, day.getDate(), h, min);

/** Whole days from today to the instant's day, counted in Chicago. */
export function chicagoDaysUntil(d: Date): number {
  const a = chicagoParts(d), b = chicagoParts(new Date());
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}
