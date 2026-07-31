import { describe, expect, it } from "vitest";
import {
  ANNOTATION_CUSTOM_COLOR_PROPERTY,
  ARROW_MASK_PROPERTIES,
  applyArrowAppearanceSettings,
  buildArrowSvg,
  clearArrowAppearanceSettings,
} from "../src/arrow-settings";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("buildArrowSvg", () => {
  it("builds straight arrows in every annotation direction", () => {
    for (const place of Object.keys(ARROW_MASK_PROPERTIES)) {
      const svg = buildArrowSvg(place, "straight", "solid", 35);

      expect(svg).toContain('data-crisp-arrow-style="straight"');
      expect(svg).toContain("<path");
      expect(svg).not.toContain("stroke-dasharray");
    }
  });

  it("uses the selected curve direction and dashed stroke", () => {
    const positive = buildArrowSvg("bottom", "custom-curve", "dashed", 70);
    const negative = buildArrowSvg("bottom", "custom-curve", "dashed", -70);

    expect(positive).toContain('stroke-dasharray="5 4"');
    expect(positive).not.toBe(negative);
  });

  it("builds a distinct spiral arrow", () => {
    const svg = buildArrowSvg("right", "spiral", "solid", 35);
    const shaft = svg.match(/<path d="([^"]+)"/)?.[1] ?? "";

    expect(svg).toContain('data-crisp-arrow-style="spiral"');
    expect(shaft.match(/ Q/g)?.length).toBeGreaterThan(24);
  });

  it("builds wavy and double-line arrow styles", () => {
    const wavySvg = buildArrowSvg("bottom", "wavy", "solid", 0);
    expect(wavySvg).toContain('data-crisp-arrow-style="wavy"');

    const doubleSvg = buildArrowSvg("bottom", "double-underline", "solid", 0);
    expect(doubleSvg).toContain('data-crisp-arrow-style="double-underline"');
  });
});

describe("applyArrowAppearanceSettings", () => {
  it("keeps the existing hand-drawn solid masks as the default", () => {
    const element = document.createElement("div");

    applyArrowAppearanceSettings(element.style, DEFAULT_SETTINGS);

    for (const property of Object.values(ARROW_MASK_PROPERTIES)) {
      expect(element.style.getPropertyValue(property)).toBe("");
    }
    expect(element.style.getPropertyValue(ANNOTATION_CUSTOM_COLOR_PROPERTY))
      .toBe(DEFAULT_SETTINGS.customColor);
  });

  it("installs generated masks for non-default arrow appearance", () => {
    const element = document.createElement("div");

    applyArrowAppearanceSettings(element.style, {
      ...DEFAULT_SETTINGS,
      arrowStyle: "straight",
      arrowStrokeStyle: "dashed",
    });

    for (const property of Object.values(ARROW_MASK_PROPERTIES)) {
      expect(element.style.getPropertyValue(property)).toContain("data:image/svg+xml");
    }

    clearArrowAppearanceSettings(element.style);
    for (const property of Object.values(ARROW_MASK_PROPERTIES)) {
      expect(element.style.getPropertyValue(property)).toBe("");
    }
    expect(element.style.getPropertyValue(ANNOTATION_CUSTOM_COLOR_PROPERTY)).toBe("");
  });
});
