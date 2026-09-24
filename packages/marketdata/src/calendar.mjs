// NYSE cash-equity holidays and early closes, from the NYSE Group 2026–2028 calendar.
// Nasdaq cash equities observe the same dates. Sessions run from 2026-09-23 through 2026-09-23 + 12 months.

const HOLIDAYS = new Set([
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
]);

const EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24"]);

const PRINT_BAND_SECS = 1800;
const FALLBACK_AFTER_OPEN_SECS = 2 * 60 * 60;

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function idOf(year, month, day) {
  return year * 10000 + month * 100 + day;
}

function nextDay(year, month, day) {
  const dt = new Date(Date.UTC(year, month - 1, day + 1));
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

function nthSundayUtc(year, month, n) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const date = 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
  return Date.UTC(year, month - 1, date);
}

function isDst(year, month, day) {
  const start = nthSundayUtc(year, 3, 2);
  const end = nthSundayUtc(year, 11, 1);
  const cur = Date.UTC(year, month - 1, day);
  return cur >= start && cur < end;
}

export function etToUnix(year, month, day, hour, minute) {
  const offsetHours = isDst(year, month, day) ? 4 : 5;
  return Math.floor(Date.UTC(year, month - 1, day, hour + offsetHours, minute, 0) / 1000);
}

function isTradingDay(year, month, day) {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAYS.has(iso(year, month, day));
}

function nextTradingDay(year, month, day) {
  let cur = nextDay(year, month, day);
  for (let i = 0; i < 12; i++) {
    if (isTradingDay(cur[0], cur[1], cur[2])) return cur;
    cur = nextDay(cur[0], cur[1], cur[2]);
  }
  throw new Error(`no trading day after ${iso(year, month, day)}`);
}

export function buildSessions(from = [2026, 9, 23], to = [2027, 9, 23]) {
  const sessions = [];
  for (let cur = from; idOf(cur[0], cur[1], cur[2]) <= idOf(to[0], to[1], to[2]); cur = nextDay(cur[0], cur[1], cur[2])) {
    const [year, month, day] = cur;
    if (!isTradingDay(year, month, day)) continue;
    const key = iso(year, month, day);
    const early = EARLY_CLOSE.has(key);
    const closeHour = early ? 13 : 16;
    const [ny, nm, nd] = nextTradingDay(year, month, day);
    const closeTs = etToUnix(year, month, day, closeHour, 0);
    const openTs = etToUnix(ny, nm, nd, 9, 30);
    sessions.push({
      id: idOf(year, month, day),
      closeTs,
      openTs,
      fallbackDeadline: openTs + FALLBACK_AFTER_OPEN_SECS,
      printBandSecs: PRINT_BAND_SECS,
      early,
    });
  }
  return sessions;
}
