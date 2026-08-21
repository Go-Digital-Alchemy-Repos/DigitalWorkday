const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: number("year"),
    month: number("month"),
    day: number("day"),
    hour: number("hour"),
    minute: number("minute"),
    second: number("second"),
  };
}

export function assertTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
}

export function zonedDateKey(value: Date, timeZone: string): string {
  const parts = dateParts(value, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addCalendarDays(date: string, amount: number): string {
  if (!dateOnlyPattern.test(date)) throw new Error("Invalid calendar date");
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return value.toISOString().slice(0, 10);
}

export function zonedStartOfDay(date: string, timeZone: string): Date {
  if (!dateOnlyPattern.test(date)) throw new Error("Invalid calendar date");
  assertTimeZone(timeZone);
  const [year, month, day] = date.split("-").map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day);
  let candidate = targetWallTime;

  // Offset rules vary by date and can change at DST boundaries. Re-resolving the
  // wall-clock delta converges on the UTC instant represented by local midnight.
  for (let index = 0; index < 3; index += 1) {
    const parts = dateParts(new Date(candidate), timeZone);
    const renderedWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const delta = targetWallTime - renderedWallTime;
    candidate += delta;
    if (delta === 0) break;
  }
  return new Date(candidate);
}

export function zonedDayRange(date: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedStartOfDay(date, timeZone),
    end: zonedStartOfDay(addCalendarDays(date, 1), timeZone),
  };
}

export function trailingDateKeys(date: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addCalendarDays(date, index - count + 1));
}
