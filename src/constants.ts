import type { AnnotationPlace, AnnotationColor } from "./annotation-syntax";
import type { AnnotationFontMode, ArrowStyle, ArrowStrokeStyle, AnnotationLayout } from "./settings";

export const PLACE_LABELS: Record<AnnotationPlace, string> = {
  top: "上方",
  "top-right": "右上方",
  right: "右侧",
  "bottom-right": "右下方",
  bottom: "下方",
  "bottom-left": "左下方",
  left: "左侧",
  "top-left": "左上方",
};

export const COLOR_LABELS: Record<AnnotationColor, string> = {
  neutral: "中性",
  amber: "琥珀",
  orange: "橙色",
  blue: "蓝色",
  green: "绿色",
  red: "红色",
  purple: "紫色",
  rainbow: "彩虹",
  custom: "自定义",
};

export const ARROW_STYLE_LABELS: Record<ArrowStyle, string> = {
  "hand-drawn": "手绘",
  straight: "直线",
  "custom-curve": "自定义曲线",
  spiral: "螺旋",
  wavy: "波浪线",
  "double-underline": "双线",
};

export const FONT_MODE_LABELS: Record<AnnotationFontMode, string> = {
  handwritten: "内置手写体",
  body: "跟随正文",
  custom: "自定义字体",
};

export const ARROW_STROKE_LABELS: Record<ArrowStrokeStyle, string> = {
  solid: "实线",
  dashed: "虚线",
};

export const ANNOTATION_LAYOUT_LABELS: Record<AnnotationLayout, string> = {
  inline: "内联",
  "smart-margins": "智能页边",
  "left-margin": "左侧页边",
  "right-margin": "右侧页边",
};
