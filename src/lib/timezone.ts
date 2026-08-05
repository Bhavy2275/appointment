export const BUSINESS_TIMEZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE ||
  process.env.BUSINESS_TIMEZONE ||
  'Asia/Kolkata';

/**
 * Creates an ISO UTC timestamp string for a given date (year, month 0-indexed, day)
 * and time (hours 0-23, minutes 0-59) interpreted strictly in Indian Standard Time (Asia/Kolkata, UTC+5:30).
 */
export function createBusinessTimeIso(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number
): string {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const min = String(minutes).padStart(2, '0');

  // Explicitly specify +05:30 offset so Date constructor parses it in IST regardless of local system timezone
  const isoWithOffset = `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`;
  return new Date(isoWithOffset).toISOString();
}

/**
 * Formats a Date/ISO string to localized 12-hour time string in Asia/Kolkata.
 * e.g., "10:15 AM"
 */
export function formatSlotTime(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: BUSINESS_TIMEZONE,
  });
}

/**
 * Formats a slot start time and end time into a range string in Asia/Kolkata.
 * e.g., "10:15 AM - 10:30 AM" or "10:15 AM - 10:30 AM GMT+5:30"
 */
export function formatSlotRange(
  dateInput: string | Date,
  durationMinutes: number = 15,
  includeTzName: boolean = false
): string {
  const start = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const startStr = start.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: BUSINESS_TIMEZONE,
  });

  const endStr = end.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: BUSINESS_TIMEZONE,
    ...(includeTzName ? { timeZoneName: 'short' } : {}),
  });

  return `${startStr} - ${endStr}`;
}

/**
 * Formats a Date/ISO string to localized date string in Asia/Kolkata.
 * e.g., "Wednesday, August 5, 2026" or "Wed, Aug 5, 2026"
 */
export function formatSlotDate(
  dateInput: string | Date,
  formatStyle: 'full' | 'medium' | 'short' = 'full'
): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (formatStyle === 'full') {
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: BUSINESS_TIMEZONE,
    });
  } else if (formatStyle === 'medium') {
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: BUSINESS_TIMEZONE,
    });
  } else {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: BUSINESS_TIMEZONE,
    });
  }
}

/**
 * Returns YYYY-MM-DD date string in Asia/Kolkata timezone.
 */
export function getKolkataDateString(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

/**
 * Returns day name (e.g. "Wed") in Asia/Kolkata timezone.
 */
export function getKolkataDayName(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: BUSINESS_TIMEZONE });
}

/**
 * Returns day number (e.g. "5") in Asia/Kolkata timezone.
 */
export function getKolkataDayNum(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-US', { day: 'numeric', timeZone: BUSINESS_TIMEZONE });
}

/**
 * Returns month name (e.g. "Aug") in Asia/Kolkata timezone.
 */
export function getKolkataMonthName(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: BUSINESS_TIMEZONE });
}
