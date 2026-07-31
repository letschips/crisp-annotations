import type { CrispAnnotationsSettings } from "./settings";

export const ANNOTATION_FONT_OVERRIDE_PROPERTY = "--crisp-ann-font-override";

type FontStyle = Pick<CSSStyleDeclaration, "removeProperty" | "setProperty">;

function resolveAnnotationFontOverride(
  settings: CrispAnnotationsSettings,
): string | null {
  if (settings.annotationFontMode === "body") {
    return "var(--font-text)";
  }
  if (settings.annotationFontMode === "custom") {
    return settings.customFontFamily.trim() || null;
  }
  return null;
}

export function clearAnnotationFontSettings(style: FontStyle): void {
  style.removeProperty(ANNOTATION_FONT_OVERRIDE_PROPERTY);
}

export function applyAnnotationFontSettings(
  style: FontStyle,
  settings: CrispAnnotationsSettings,
): void {
  const override = resolveAnnotationFontOverride(settings);
  if (override) {
    style.setProperty(ANNOTATION_FONT_OVERRIDE_PROPERTY, override);
  } else {
    clearAnnotationFontSettings(style);
  }
}
