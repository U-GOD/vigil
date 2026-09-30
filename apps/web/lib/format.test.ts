import { describe, expect, it } from "vitest";
import { holdingRisk, timeToHalt, units, wadPercent } from "./format.js";

describe("terminal figures", () => {
  it("puts the worst case on the paired amount", () => {
    const risk = holdingRisk(2_500_000n, 1_000_000n);
    expect(risk.paired).toBe(1_000_000n);
    expect(risk.nakedUp).toBe(1_500_000n);
    expect(risk.nakedDn).toBe(0n);
    expect(risk.worstRedeem).toBe(1_000_000n);
    expect(risk.nakedAtRisk).toBe(1_500_000n);
    expect(units(risk.worstRedeem)).toBe("1.000000");
    expect(units(risk.nakedAtRisk)).toBe("1.500000");
  });

  it("formats a cap and a clock", () => {
    expect(wadPercent((10n ** 17n).toString())).toBe("10.00%");
    expect(wadPercent(null)).toBe("n/a");
    expect(timeToHalt("1000", 1000)).toBe("past close");
    expect(timeToHalt("4660", 1000)).toBe("1h 1m");
  });
});
