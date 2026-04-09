/**
 * Parse hours input: "2h", "2 h", "2.5h", "1h 30m", "30m" -> seconds or null if invalid.
 * Allows duplicate units.
 */
export function parseHoursToSeconds(input) {
  if (input == null || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/,/g, '.').toLowerCase();
  let totalSeconds = 0;

  const hMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hMatch) {
    totalSeconds += parseFloat(hMatch[1]) * 3600;
  }

  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m/);
  if (mMatch) {
    totalSeconds += parseFloat(mMatch[1]) * 60;
  }

  if (totalSeconds > 0) return Math.round(totalSeconds);

  const onlyNumber = normalized.match(/^(\d+(?:\.\d+)?)\s*$/);
  if (onlyNumber) {
    const val = parseFloat(onlyNumber[1]);
    if (Number.isFinite(val) && val > 0) return Math.round(val * 3600);
  }

  return null;
}

/**
 * Parse duration input: "2h", "2 h", "2.5h", "1h 30m", "30m" -> minutes or null if invalid.
 * Rejects ambiguous inputs with duplicate units (e.g., "2h 2h" or "30m 45m").
 */
export function parseDurationToMinutes(input) {
  if (input == null || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/,/g, '.').toLowerCase();

  // Check for duplicate unit patterns (ambiguous input)
  const hourMatches = normalized.match(/\d+(?:\.\d+)?\s*h/g);
  const minuteMatches = normalized.match(/\d+(?:\.\d+)?\s*m/g);

  if ((hourMatches && hourMatches.length > 1) || (minuteMatches && minuteMatches.length > 1)) {
    return null;
  }

  let totalMinutes = 0;

  const hMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hMatch) {
    totalMinutes += parseFloat(hMatch[1]) * 60;
  }

  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m/);
  if (mMatch) {
    totalMinutes += parseFloat(mMatch[1]);
  }

  if (totalMinutes > 0) return totalMinutes;

  const onlyNumber = normalized.match(/^(\d+(?:\.\d+)?)\s*$/);
  if (onlyNumber) {
    const val = parseFloat(onlyNumber[1]);
    if (Number.isFinite(val) && val > 0) return Math.round(val * 60);
  }

  return null;
}

/**
 * Format seconds to human readable string (e.g., "2h 30m").
 */
export function formatSecondsToHuman(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * Format minutes to human readable string (e.g., "2h 30m").
 */
export function formatMinutesToHuman(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}
