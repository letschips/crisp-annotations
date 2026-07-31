import { describe, expect, it } from "vitest";
import {
  ANNOTATION_FONT_OVERRIDE_PROPERTY,
  applyAnnotationFontSettings,
} from "../src/font-settings";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("applyAnnotationFontSettings", () => {
  it("uses the bundled handwriting font when no override is selected", () => {
    const element = document.createElement("div");

    applyAnnotationFontSettings(element.style, DEFAULT_SETTINGS);

    expect(element.style.getPropertyValue(ANNOTATION_FONT_OVERRIDE_PROPERTY)).toBe("");
  });

  it("can follow the Obsidian body font", () => {
    const element = document.createElement("div");

    applyAnnotationFontSettings(element.style, {
      ...DEFAULT_SETTINGS,
      annotationFontMode: "body",
    });

    expect(element.style.getPropertyValue(ANNOTATION_FONT_OVERRIDE_PROPERTY))
      .toBe("var(--font-text)");
  });

  it("uses a custom CSS font stack and falls back when it is blank", () => {
    const element = document.createElement("div");

    applyAnnotationFontSettings(element.style, {
      ...DEFAULT_SETTINGS,
      annotationFontMode: "custom",
      customFontFamily: '"LXGW WenKai", cursive',
    });
    expect(element.style.getPropertyValue(ANNOTATION_FONT_OVERRIDE_PROPERTY))
      .toBe('"LXGW WenKai", cursive');

    applyAnnotationFontSettings(element.style, {
      ...DEFAULT_SETTINGS,
      annotationFontMode: "custom",
      customFontFamily: "   ",
    });
    expect(element.style.getPropertyValue(ANNOTATION_FONT_OVERRIDE_PROPERTY)).toBe("");
  });
});
