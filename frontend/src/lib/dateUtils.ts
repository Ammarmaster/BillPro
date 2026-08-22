/**
 * Universal date parser and business cycle helper.
 * 100% compatible with Android Hermes engine, iOS JavaScriptCore, and Web V8.
 */

export function safeParseDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === "number") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts !== "string") return null;

  const clean = ts.trim();
  if (!clean) return null;

  // 1. Direct parse attempt
  let d = new Date(clean);
  if (!isNaN(d.getTime())) return d;

  // 2. Android Hermes engine fix: Normalize ISO 8601 string
  try {
    let s = clean.replace(" ", "T");
    s = s.replace(/\+00:?00$/, "Z");
    s = s.replace(/(\.\d{3})\d+/, "$1");
    d = new Date(s);
    if (!isNaN(d.getTime())) return d;

    // 3. Fallback explicit regex with ISO matching
    const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?(?:([+-]\d{2}):?(\d{2})|Z)?/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const min = match[5] ? parseInt(match[5], 10) : 0;
      const sec = match[6] ? parseInt(match[6], 10) : 0;
      const ms = match[7] ? parseInt(match[7].slice(0, 3).padEnd(3, "0"), 10) : 0;
      
      const tzSign = match[8] ? match[8][0] : null;
      const tzHours = match[8] ? parseInt(match[8].slice(1), 10) : 0;
      const tzMins = match[9] ? parseInt(match[9], 10) : 0;
      
      if (clean.endsWith("Z") || tzSign) {
        let utcMs = Date.UTC(year, month, day, hour, min, sec, ms);
        if (tzSign === "+") {
          utcMs -= (tzHours * 60 + tzMins) * 60000;
        } else if (tzSign === "-") {
          utcMs += (tzHours * 60 + tzMins) * 60000;
        }
        return new Date(utcMs);
      }
      return new Date(year, month, day, hour, min, sec, ms);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Checks if a timestamp belongs to the current restaurant business cycle.
 * Restaurant business cycle begins at 01:00:00 AM local time and runs until 01:00:00 AM next day.
 */
export function isTodayBusinessDay(ts?: any): boolean {
  if (!ts) return false;
  const d = safeParseDate(ts);
  if (!d) return false;

  const now = new Date();
  const cutoff = new Date(now);
  if (now.getHours() >= 1) {
    cutoff.setHours(1, 0, 0, 0);
  } else {
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(1, 0, 0, 0);
  }

  return d.getTime() >= cutoff.getTime();
}

/**
 * Formats timestamp for UI display (DD/MM/YYYY, HH:MM:SS) safely on all platforms.
 */
export function formatDateTime(ts?: any): string {
  if (!ts) return "";
  const d = safeParseDate(ts);
  if (!d) return String(ts);
  try {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  } catch {
    return String(ts);
  }
}
