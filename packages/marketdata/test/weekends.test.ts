import { describe, expect, it } from "vitest";
import { etParts, selectWeekends, type DailyBar } from "../src/weekends.js";

const FRIDAY = 1_717_767_000;
const MONDAY = 1_718_026_200;

function bar(timeSec: number, open: number, close: number, adjClose = close): DailyBar {
  return { timeSec, open, close, adjClose };
}

describe("weekend selection", () => {
  it("reads the Friday and Monday in America/New_York", () => {
    expect(etParts(FRIDAY)).toEqual({ weekday: "Fri", date: "2024-06-07" });
    expect(etParts(MONDAY)).toEqual({ weekday: "Mon", date: "2024-06-10" });
  });

  it("pairs a Friday close with the next session open", () => {
    const selected = selectWeekends([
      bar(FRIDAY, 100, 100, 99),
      bar(MONDAY, 110, 110, 110),
    ]);
    expect(selected.droppedSplitWeekends).toBe(0);
    expect(selected.kept).toEqual([
      {
        sessionId: 20240607,
        closeDate: "2024-06-07",
        openDate: "2024-06-10",
        closeTs: FRIDAY,
        openTs: MONDAY,
        close: 99,
        open: 110,
      },
    ]);
  });

  it("drops a weekend a split crosses", () => {
    const selected = selectWeekends([bar(FRIDAY, 100, 100), bar(MONDAY, 110, 110)], [MONDAY]);
    expect(selected.kept).toEqual([]);
    expect(selected.droppedSplitWeekends).toBe(1);
  });

  it("ignores a Thursday close and a next-day bar", () => {
    const thursday = FRIDAY - 86_400;
    expect(etParts(thursday).weekday).toBe("Thu");
    expect(selectWeekends([bar(thursday, 100, 100), bar(MONDAY, 110, 110)]).kept).toEqual([]);
    expect(selectWeekends([bar(FRIDAY, 100, 100), bar(FRIDAY + 86_400, 110, 110)]).kept).toEqual([]);
  });

  it("keeps the most recent rows and does not pad", () => {
    const laterFriday = FRIDAY + 7 * 86_400;
    const laterMonday = MONDAY + 7 * 86_400;
    const selected = selectWeekends(
      [bar(FRIDAY, 100, 100), bar(MONDAY, 101, 101), bar(laterFriday, 100, 100), bar(laterMonday, 102, 102)],
      [],
      1,
    );
    expect(selected.kept).toHaveLength(1);
    expect(selected.kept[0]?.sessionId).toBe(Number(etParts(laterFriday).date.replaceAll("-", "")));
  });
});
