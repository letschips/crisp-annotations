import type { CrispAnnotationsSettings } from "./settings";

export interface AnnotationModalPresentation {
  placementDescription: string;
  placementName: string;
  summary: string;
}

const LAYOUT_LABELS: Record<CrispAnnotationsSettings["annotationLayout"], string> = {
  inline: "Inline",
  "smart-margins": "Smart margins",
  "left-margin": "Left margin",
  "right-margin": "Right margin",
};

const ARROW_LABELS: Record<CrispAnnotationsSettings["arrowStyle"], string> = {
  "hand-drawn": "Hand-drawn",
  straight: "Straight",
  "custom-curve": "Custom curve",
  spiral: "Coiled spiral",
  wavy: "Wavy line",
  "double-underline": "Double line",
};

const STROKE_LABELS: Record<CrispAnnotationsSettings["arrowStrokeStyle"], string> = {
  solid: "Solid",
  dashed: "Dashed",
};

const FONT_LABELS: Record<CrispAnnotationsSettings["annotationFontMode"], string> = {
  handwritten: "Bundled handwriting",
  body: "Body font",
  custom: "Custom font",
};

export function buildAnnotationModalPresentation(
  settings: CrispAnnotationsSettings,
): AnnotationModalPresentation {
  const usesMargins = settings.annotationLayout !== "inline";
  return {
    placementDescription: usesMargins
      ? "Preferred side; Smart margins may rebalance it."
      : "Where the label sits relative to the target text.",
    placementName: usesMargins ? "Preferred placement" : "Placement",
    summary: [
      LAYOUT_LABELS[settings.annotationLayout],
      ARROW_LABELS[settings.arrowStyle],
      STROKE_LABELS[settings.arrowStrokeStyle],
      FONT_LABELS[settings.annotationFontMode],
    ].join(" · "),
  };
}
