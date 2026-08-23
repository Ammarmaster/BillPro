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

    // 4. DD/MM/YYYY or DD-MM-YYYY formats (e.g. "22/08/2026, 20:48:36")
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
      const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
      const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
      return new Date(year, month, day, hour, min, sec);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Checks if a timestamp belongs to the current calendar business day (00:00:00 to 23:59:59).
 * Resets at 12:00 AM midnight standard like BharatPe / Paytm Merchant.
 */
export function isTodayBusinessDay(ts?: any): boolean {
  if (!ts) return false;
  const d = safeParseDate(ts);
  if (!d) return false;

  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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
