import { describe, expect, it } from "vitest";
import { findClosestVisibleAnnotationIndex } from "../src/reading-position";

describe("findClosestVisibleAnnotationIndex", () => {
  it("chooses the visible annotation closest to the reading viewport center", () => {
    expect(findClosestVisibleAnnotationIndex([
      { top: -80, bottom: -40 },
      { top: 100, bottom: 130 },
      { top: 270, bottom: 310 },
      { top: 620, bottom: 660 },
    ], 0, 600)).toBe(2);
  });

  it("includes annotations crossing a viewport edge", () => {
    expect(findClosestVisibleAnnotationIndex([
      { top: -10, bottom: 20 },
      { top: 150, bottom: 170 },
    ], 0, 100)).toBe(0);
  });

  it("returns null when no annotation is visible", () => {
    expect(findClosestVisibleAnnotationIndex([
      { top: -100, bottom: -20 },
      { top: 120, bottom: 150 },
    ], 0, 100)).toBeNull();
  });
});
