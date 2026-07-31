import type { AnnotationPlace, AnnotationColor } from "./annotation-syntax";
import type { AnnotationFontMode, ArrowStyle, ArrowStrokeStyle, AnnotationLayout } from "./settings";

export const PLACE_LABELS: Record<AnnotationPlace, string> = {
  top: "Above",
  "top-right": "Above right",
  right: "Right",
  "bottom-right": "Below right",
  bottom: "Below",
  "bottom-left": "Below left",
  left: "Left",
  "top-left": "Above left",
};

export const COLOR_LABELS: Record<AnnotationColor, string> = {
  neutral: "Neutral",
  amber: "Amber",
  orange: "Orange",
  blue: "Blue",
  green: "Green",
  red: "Red",
  purple: "Purple",
  rainbow: "Rainbow",
  custom: "Custom",
};

export const ARROW_STYLE_LABELS: Record<ArrowStyle, string> = {
  "hand-drawn": "Hand-drawn",
  straight: "Straight",
  "custom-curve": "Custom curve",
  spiral: "Coiled spiral",
  wavy: "Wavy line",
  "double-underline": "Double line",
};

export const FONT_MODE_LABELS: Record<AnnotationFontMode, string> = {
  handwritten: "Bundled handwriting",
  body: "Follow body text",
  custom: "Custom font",
};

export const ARROW_STROKE_LABELS: Record<ArrowStrokeStyle, string> = {
  solid: "Solid",
  dashed: "Dashed",
};

export const ANNOTATION_LAYOUT_LABELS: Record<AnnotationLayout, string> = {
  inline: "Inline",
  "smart-margins": "Smart margins",
  "left-margin": "Left margin",
  "right-margin": "Right margin",
};
