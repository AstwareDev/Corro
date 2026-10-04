import { describe, expect, it } from "vitest";
import { guideLabelPosition, markerLabelPosition } from "./ChartView";

describe("chart label placement", () => {
  it("spreads marker labels around their dots", () => {
    expect(markerLabelPosition(0)).toBe("top");
    expect(markerLabelPosition(1)).toBe("bottom");
    expect(markerLabelPosition(2)).toBe("right");
    expect(markerLabelPosition(3)).toBe("left");
    expect(markerLabelPosition(4)).toBe("top");
  });

  it("parks guide labels at opposite corners", () => {
    expect(guideLabelPosition("x")).toBe("insideBottomLeft");
    expect(guideLabelPosition("y")).toBe("insideTopRight");
  });
});
