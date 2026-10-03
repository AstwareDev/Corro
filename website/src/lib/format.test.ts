import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatSearchBucket } from "./format";

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("formatSearchBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets recent times", () => {
    const now = Date.now();
    expect(formatSearchBucket(new Date(now - 10 * 60_000).toISOString())).toBe(
      "Past hour",
    );
    expect(formatSearchBucket(new Date(now - 3 * HOUR).toISOString())).toBe(
      "Today",
    );
  });

  it("labels yesterday and recent ranges", () => {
    const now = Date.now();
    expect(formatSearchBucket(new Date(now - 26 * HOUR).toISOString())).toBe(
      "Yesterday",
    );
    expect(formatSearchBucket(new Date(now - 3 * DAY).toISOString())).toBe(
      "Past week",
    );
    expect(formatSearchBucket(new Date(now - 10 * DAY).toISOString())).toBe(
      "Past month",
    );
  });

  it("formats older dates with and without the year", () => {
    expect(formatSearchBucket("2026-03-04T09:00:00")).toBe("Mar 4");
    expect(formatSearchBucket("2024-11-20T09:00:00")).toContain("2024");
  });

  it("returns empty for invalid input", () => {
    expect(formatSearchBucket("not-a-date")).toBe("");
  });
});
