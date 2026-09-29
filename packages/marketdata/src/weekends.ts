export type DailyBar = {
  timeSec: number;
  open: number;
  close: number;
  adjClose: number;
};

export type WeekendPrint = {
  sessionId: number;
  closeDate: string;
  openDate: string;
  closeTs: number;
  openTs: number;
  close: number;
  open: number;
};

export type WeekendSelection = {
  kept: WeekendPrint[];
  droppedSplitWeekends: number;
};

const et = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function etParts(unixSec: number): { weekday: string; date: string } {
  const parts = et.formatToParts(new Date(unixSec * 1000));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: value("weekday"),
    date: `${value("year")}-${value("month")}-${value("day")}`,
  };
}

function calendarDays(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 0, fromDay = 0] = from.split("-").map(Number);
  const [toYear = 0, toMonth = 0, toDay = 0] = to.split("-").map(Number);
  const ms = Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay);
  return Math.round(ms / 86_400_000);
}

function adjusted(bar: DailyBar): { close: number; open: number } | null {
  if (!Number.isFinite(bar.open) || !Number.isFinite(bar.close) || !Number.isFinite(bar.adjClose)) return null;
  if (bar.open <= 0 || bar.close <= 0 || bar.adjClose <= 0) return null;
  return { close: bar.adjClose, open: bar.open * (bar.adjClose / bar.close) };
}

/**
 * Friday close in America/New_York, paired with the next bar when that bar is at least
 * two calendar days later. A split timestamp strictly after the Friday bar and on or
 * before the next bar drops that weekend. The result is the most recent `limit` rows.
 */
export function selectWeekends(
  bars: readonly DailyBar[],
  splits: readonly number[] = [],
  limit = 52,
): WeekendSelection {
  const ordered = bars.filter((bar) => Number.isFinite(bar.timeSec)).slice().sort((a, b) => a.timeSec - b.timeSec);
  const kept: WeekendPrint[] = [];
  let droppedSplitWeekends = 0;

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const friday = ordered[i];
    const next = ordered[i + 1];
    if (!friday || !next) continue;
    const closeParts = etParts(friday.timeSec);
    if (closeParts.weekday !== "Fri") continue;
    const openParts = etParts(next.timeSec);
    if (calendarDays(closeParts.date, openParts.date) < 2) continue;
    const crossed = splits.some((split) => split > friday.timeSec && split <= next.timeSec);
    if (crossed) {
      droppedSplitWeekends += 1;
      continue;
    }
    const closePx = adjusted(friday);
    const openPx = adjusted(next);
    if (!closePx || !openPx) continue;
    const sessionId = Number(closeParts.date.replaceAll("-", ""));
    kept.push({
      sessionId,
      closeDate: closeParts.date,
      openDate: openParts.date,
      closeTs: friday.timeSec,
      openTs: next.timeSec,
      close: closePx.close,
      open: openPx.open,
    });
  }

  kept.sort((a, b) => a.closeTs - b.closeTs);
  const cap = limit < 0 ? 0 : limit;
  return { kept: kept.slice(-cap), droppedSplitWeekends };
}
