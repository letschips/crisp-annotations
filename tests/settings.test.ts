import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeHexColor,
  normalizeSettings,
} from "../src/settings";

describe("normalizeSettings", () => {
  it("defaults existing installations to the bundled handwriting font", () => {
    expect(normalizeSettings({})).toMatchObject({
      annotationFontMode: "handwritten",
      customFontFamily: "",
      recallMode: false,
    });
  });

  it("keeps only boolean active-recall preferences", () => {
    expect(normalizeSettings({ recallMode: true })).toMatchObject({
      recallMode: true,
    });
    expect(normalizeSettings({ recallMode: "yes" })).toMatchObject({
      recallMode: false,
    });
  });

  it("keeps valid values and repairs invalid values", () => {
    expect(normalizeSettings({
      defaultPlace: "left",
      defaultColor: "not-a-color",
      defaultMark: false,
      editorPreview: false,
      annotationFontMode: "custom",
      customFontFamily: '  "LXGW WenKai", cursive  ',
    })).toEqual({
      ...DEFAULT_SETTINGS,
      defaultPlace: "left",
      defaultMark: false,
      editorPreview: false,
      annotationFontMode: "custom",
      customFontFamily: '"LXGW WenKai", cursive',
    });
  });

  it("repairs an invalid font mode and non-string custom font", () => {
    expect(normalizeSettings({
      annotationFontMode: "theme",
      customFontFamily: 42,
    })).toMatchObject({
      annotationFontMode: "handwritten",
      customFontFamily: "",
    });
  });

  it("normalizes arrow appearance and custom color settings", () => {
    expect(normalizeSettings({
      arrowStyle: "custom-curve",
      arrowStrokeStyle: "dashed",
      arrowCurve: 140,
      customColor: "#0Af",
    })).toMatchObject({
      arrowStyle: "custom-curve",
      arrowStrokeStyle: "dashed",
      arrowCurve: 100,
      customColor: "#00aaff",
    });
  });

  it("normalizes color theme preset", () => {
    expect(normalizeSettings({
      colorTheme: "morandi",
    })).toMatchObject({
      colorTheme: "morandi",
    });
    expect(normalizeSettings({
      colorTheme: "invalid-theme",
    })).toMatchObject({
      colorTheme: "modern",
    });
  });

  it("repairs invalid arrow appearance values", () => {
    expect(normalizeSettings({
      arrowStyle: "zigzag",
      arrowStrokeStyle: "dots",
      arrowCurve: Number.NaN,
      customColor: "blue",
    })).toMatchObject({
      arrowStyle: DEFAULT_SETTINGS.arrowStyle,
      arrowStrokeStyle: DEFAULT_SETTINGS.arrowStrokeStyle,
      arrowCurve: DEFAULT_SETTINGS.arrowCurve,
      customColor: DEFAULT_SETTINGS.customColor,
    });
  });

  it("normalizes margin-note layout settings", () => {
    expect(normalizeSettings({
      annotationLayout: "smart-margins",
      marginNoteWidth: 400,
    })).toMatchObject({
      annotationLayout: "smart-margins",
      marginNoteWidth: 260,
    });
  });

  it("keeps existing installations on the inline layout", () => {
    expect(normalizeSettings({
      annotationLayout: "outside",
      marginNoteWidth: "wide",
    })).toMatchObject({
      annotationLayout: "inline",
      marginNoteWidth: DEFAULT_SETTINGS.marginNoteWidth,
    });
  });

  it("normalizes rememberLastChoice and last-used fields", () => {
    expect(normalizeSettings({
      rememberLastChoice: false,
      lastUsedPlace: "left",
      lastUsedColor: "blue",
      lastUsedMark: true,
    })).toMatchObject({
      rememberLastChoice: false,
      lastUsedPlace: "left",
      lastUsedColor: "blue",
      lastUsedMark: true,
    });
  });

  it("repairs invalid last-used values", () => {
    expect(normalizeSettings({
      rememberLastChoice: "yes",
      lastUsedPlace: "inside",
      lastUsedColor: "cyan",
      lastUsedMark: "maybe",
    })).toMatchObject({
      rememberLastChoice: true,
      lastUsedPlace: DEFAULT_SETTINGS.lastUsedPlace,
      lastUsedColor: DEFAULT_SETTINGS.lastUsedColor,
      lastUsedMark: true,
    });
  });
});

describe("normalizeHexColor", () => {
  it("accepts three- and six-digit hex colors", () => {
    expect(normalizeHexColor("#AbC")).toBe("#aabbcc");
    expect(normalizeHexColor("#12ABef")).toBe("#12abef");
  });

  it("rejects non-hex CSS values", () => {
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("#abcd")).toBeNull();
  });
});
