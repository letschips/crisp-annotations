import {
  ANNOTATION_COLORS,
  ANNOTATION_PLACES,
  type AnnotationColor,
  type AnnotationPlace,
} from "./annotation-syntax";

export const ANNOTATION_FONT_MODES = [
  "handwritten",
  "body",
  "custom",
] as const;

export type AnnotationFontMode = typeof ANNOTATION_FONT_MODES[number];

export const ARROW_STYLES = [
  "hand-drawn",
  "straight",
  "custom-curve",
  "spiral",
  "wavy",
  "double-underline",
] as const;

export const ARROW_STROKE_STYLES = [
  "solid",
  "dashed",
] as const;

export type ArrowStyle = typeof ARROW_STYLES[number];
export type ArrowStrokeStyle = typeof ARROW_STROKE_STYLES[number];

export const ANNOTATION_LAYOUTS = [
  "inline",
  "smart-margins",
  "left-margin",
  "right-margin",
] as const;

export type AnnotationLayout = typeof ANNOTATION_LAYOUTS[number];

export const COLOR_THEMES = [
  "modern",
  "morandi",
  "kindle",
  "cyberpunk",
] as const;

export type ColorTheme = typeof COLOR_THEMES[number];

export const COLOR_THEME_LABELS: Record<ColorTheme, string> = {
  modern: "Classic Crisp",
  morandi: "Morandi Muted",
  kindle: "Kindle Paper",
  cyberpunk: "Cyberpunk Neon",
};

export interface CrispAnnotationsSettings {
  defaultPlace: AnnotationPlace;
  defaultColor: AnnotationColor;
  defaultMark: boolean;
  editorPreview: boolean;
  annotationFontMode: AnnotationFontMode;
  customFontFamily: string;
  arrowStyle: ArrowStyle;
  arrowStrokeStyle: ArrowStrokeStyle;
  arrowCurve: number;
  customColor: string;
  colorTheme: ColorTheme;
  annotationLayout: AnnotationLayout;
  marginNoteWidth: number;
  rememberLastChoice: boolean;
  lastUsedPlace: AnnotationPlace;
  lastUsedColor: AnnotationColor;
  lastUsedMark: boolean;
  recallMode: boolean;
  licenseCode: string;
}

export const DEFAULT_SETTINGS: CrispAnnotationsSettings = {
  defaultPlace: "bottom",
  defaultColor: "amber",
  defaultMark: true,
  editorPreview: true,
  annotationFontMode: "handwritten",
  customFontFamily: "",
  arrowStyle: "hand-drawn",
  arrowStrokeStyle: "solid",
  arrowCurve: 35,
  customColor: "#3b82f6",
  colorTheme: "modern",
  annotationLayout: "inline",
  marginNoteWidth: 180,
  rememberLastChoice: true,
  lastUsedPlace: "bottom",
  lastUsedColor: "amber",
  lastUsedMark: true,
  recallMode: false,
  licenseCode: "",
};

export function normalizeHexColor(value: string): string | null {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const digits = match[1].toLowerCase();
  if (digits.length === 3) {
    return `#${[...digits].map((digit) => `${digit}${digit}`).join("")}`;
  }
  return `#${digits}`;
}

export function normalizeSettings(value: unknown): CrispAnnotationsSettings {
  const candidate = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  return {
    defaultPlace: ANNOTATION_PLACES.includes(candidate.defaultPlace as AnnotationPlace)
      ? candidate.defaultPlace as AnnotationPlace
      : DEFAULT_SETTINGS.defaultPlace,
    defaultColor: ANNOTATION_COLORS.includes(candidate.defaultColor as AnnotationColor)
      ? candidate.defaultColor as AnnotationColor
      : DEFAULT_SETTINGS.defaultColor,
    defaultMark: typeof candidate.defaultMark === "boolean"
      ? candidate.defaultMark
      : DEFAULT_SETTINGS.defaultMark,
    editorPreview: typeof candidate.editorPreview === "boolean"
      ? candidate.editorPreview
      : DEFAULT_SETTINGS.editorPreview,
    annotationFontMode: ANNOTATION_FONT_MODES.includes(
      candidate.annotationFontMode as AnnotationFontMode,
    )
      ? candidate.annotationFontMode as AnnotationFontMode
      : DEFAULT_SETTINGS.annotationFontMode,
    customFontFamily: typeof candidate.customFontFamily === "string"
      ? candidate.customFontFamily.trim()
      : DEFAULT_SETTINGS.customFontFamily,
    arrowStyle: ARROW_STYLES.includes(candidate.arrowStyle as ArrowStyle)
      ? candidate.arrowStyle as ArrowStyle
      : DEFAULT_SETTINGS.arrowStyle,
    arrowStrokeStyle: ARROW_STROKE_STYLES.includes(
      candidate.arrowStrokeStyle as ArrowStrokeStyle,
    )
      ? candidate.arrowStrokeStyle as ArrowStrokeStyle
      : DEFAULT_SETTINGS.arrowStrokeStyle,
    arrowCurve: typeof candidate.arrowCurve === "number"
      && Number.isFinite(candidate.arrowCurve)
      ? Math.max(-100, Math.min(100, Math.round(candidate.arrowCurve)))
      : DEFAULT_SETTINGS.arrowCurve,
    customColor: typeof candidate.customColor === "string"
      ? normalizeHexColor(candidate.customColor) ?? DEFAULT_SETTINGS.customColor
      : DEFAULT_SETTINGS.customColor,
    colorTheme: COLOR_THEMES.includes(candidate.colorTheme as ColorTheme)
      ? candidate.colorTheme as ColorTheme
      : DEFAULT_SETTINGS.colorTheme,
    annotationLayout: ANNOTATION_LAYOUTS.includes(
      candidate.annotationLayout as AnnotationLayout,
    )
      ? candidate.annotationLayout as AnnotationLayout
      : DEFAULT_SETTINGS.annotationLayout,
    marginNoteWidth: typeof candidate.marginNoteWidth === "number"
      && Number.isFinite(candidate.marginNoteWidth)
      ? Math.max(140, Math.min(260, Math.round(candidate.marginNoteWidth)))
      : DEFAULT_SETTINGS.marginNoteWidth,
    rememberLastChoice: typeof candidate.rememberLastChoice === "boolean"
      ? candidate.rememberLastChoice
      : DEFAULT_SETTINGS.rememberLastChoice,
    lastUsedPlace: ANNOTATION_PLACES.includes(candidate.lastUsedPlace as AnnotationPlace)
      ? candidate.lastUsedPlace as AnnotationPlace
      : DEFAULT_SETTINGS.lastUsedPlace,
    lastUsedColor: ANNOTATION_COLORS.includes(candidate.lastUsedColor as AnnotationColor)
      ? candidate.lastUsedColor as AnnotationColor
      : DEFAULT_SETTINGS.lastUsedColor,
    lastUsedMark: typeof candidate.lastUsedMark === "boolean"
      ? candidate.lastUsedMark
      : DEFAULT_SETTINGS.lastUsedMark,
    recallMode: typeof candidate.recallMode === "boolean"
      ? candidate.recallMode
      : DEFAULT_SETTINGS.recallMode,
    licenseCode: typeof candidate.licenseCode === "string"
      ? candidate.licenseCode.trim()
      : "",
  };
}
