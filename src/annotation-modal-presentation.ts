import type { CrispAnnotationsSettings } from "./settings";

export interface AnnotationModalPresentation {
  placementDescription: string;
  placementName: string;
  summary: string;
}

const LAYOUT_LABELS: Record<CrispAnnotationsSettings["annotationLayout"], string> = {
  inline: "内联",
  "smart-margins": "智能页边",
  "left-margin": "左侧页边",
  "right-margin": "右侧页边",
};

const ARROW_LABELS: Record<CrispAnnotationsSettings["arrowStyle"], string> = {
  "hand-drawn": "手绘",
  straight: "直线",
  "custom-curve": "自定义曲线",
  spiral: "螺旋",
  wavy: "波浪线",
  "double-underline": "双线",
};

const STROKE_LABELS: Record<CrispAnnotationsSettings["arrowStrokeStyle"], string> = {
  solid: "实线",
  dashed: "虚线",
};

const FONT_LABELS: Record<CrispAnnotationsSettings["annotationFontMode"], string> = {
  handwritten: "内置手写体",
  body: "跟随正文",
  custom: "自定义字体",
};

export function buildAnnotationModalPresentation(
  settings: CrispAnnotationsSettings,
): AnnotationModalPresentation {
  const usesMargins = settings.annotationLayout !== "inline";
  return {
    placementDescription: usesMargins
      ? "首选侧；智能页边可能重新平衡它的位置。"
      : "标签相对目标文字的摆放位置。",
    placementName: usesMargins ? "首选位置" : "位置",
    summary: [
      LAYOUT_LABELS[settings.annotationLayout],
      ARROW_LABELS[settings.arrowStyle],
      STROKE_LABELS[settings.arrowStrokeStyle],
      FONT_LABELS[settings.annotationFontMode],
    ].join(" · "),
  };
}
