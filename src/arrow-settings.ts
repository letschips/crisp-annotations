import {
  ANNOTATION_PLACES,
  type AnnotationPlace,
} from "./annotation-syntax";
import type {
  ArrowStrokeStyle,
  ArrowStyle,
  CrispAnnotationsSettings,
} from "./settings";
import { buildCoiledSpiralPath } from "./spiral-geometry";

export const ANNOTATION_CUSTOM_COLOR_PROPERTY = "--crisp-ann-custom-color";

export const ARROW_MASK_PROPERTIES: Record<AnnotationPlace, string> = {
  top: "--crisp-ann-arrow-mask-top",
  "top-right": "--crisp-ann-arrow-mask-top-right",
  right: "--crisp-ann-arrow-mask-right",
  "bottom-right": "--crisp-ann-arrow-mask-bottom-right",
  bottom: "--crisp-ann-arrow-mask-bottom",
  "bottom-left": "--crisp-ann-arrow-mask-bottom-left",
  left: "--crisp-ann-arrow-mask-left",
  "top-left": "--crisp-ann-arrow-mask-top-left",
};

interface Point {
  x: number;
  y: number;
}

interface ArrowGeometry {
  tail: Point;
  tip: Point;
}

interface HandDrawnPath {
  shaft: string;
  head: string;
}

const ARROW_GEOMETRY: Record<AnnotationPlace, ArrowGeometry> = {
  bottom: { tail: { x: 23, y: 35 }, tip: { x: 23, y: 3 } },
  "bottom-left": { tail: { x: 6, y: 32 }, tip: { x: 40, y: 6 } },
  left: { tail: { x: 4, y: 19 }, tip: { x: 43, y: 19 } },
  "top-left": { tail: { x: 6, y: 6 }, tip: { x: 40, y: 32 } },
  top: { tail: { x: 23, y: 3 }, tip: { x: 23, y: 35 } },
  "top-right": { tail: { x: 40, y: 6 }, tip: { x: 6, y: 32 } },
  right: { tail: { x: 43, y: 19 }, tip: { x: 3, y: 19 } },
  "bottom-right": { tail: { x: 40, y: 32 }, tip: { x: 6, y: 6 } },
};

const HAND_DRAWN_PATHS: Record<AnnotationPlace, HandDrawnPath> = {
  bottom: {
    shaft: "M23 35 C22 26 22 15 23 4",
    head: "M17 10 L23 3 L29 10",
  },
  "bottom-left": {
    shaft: "M6 32 C16 30 28 18 40 6",
    head: "M30 10 L40 6 L36 16",
  },
  left: {
    shaft: "M4 19 C15 18 31 18 43 19",
    head: "M36 13 L43 19 L36 25",
  },
  "top-left": {
    shaft: "M6 6 C16 8 28 20 40 32",
    head: "M36 22 L40 32 L30 28",
  },
  top: {
    shaft: "M23 4 C22 13 22 24 23 35",
    head: "M17 29 L23 36 L29 29",
  },
  "top-right": {
    shaft: "M40 6 C30 8 18 20 6 32",
    head: "M10 22 L6 32 L16 28",
  },
  right: {
    shaft: "M43 19 C32 18 15 18 3 19",
    head: "M10 13 L3 19 L10 25",
  },
  "bottom-right": {
    shaft: "M40 32 C30 30 18 18 6 6",
    head: "M16 10 L6 6 L10 16",
  },
};

type AppearanceStyle = Pick<CSSStyleDeclaration, "removeProperty" | "setProperty">;

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function point(value: Point): string {
  return `${format(value.x)} ${format(value.y)}`;
}

function vectorGeometry(geometry: ArrowGeometry): {
  length: number;
  normal: Point;
  unit: Point;
} {
  const dx = geometry.tip.x - geometry.tail.x;
  const dy = geometry.tip.y - geometry.tail.y;
  const length = Math.hypot(dx, dy);
  const unit = { x: dx / length, y: dy / length };
  return {
    length,
    unit,
    normal: { x: -unit.y, y: unit.x },
  };
}

function arrowHeadPath(geometry: ArrowGeometry): string {
  const { normal, unit } = vectorGeometry(geometry);
  const base = {
    x: geometry.tip.x - unit.x * 9,
    y: geometry.tip.y - unit.y * 9,
  };
  const left = {
    x: base.x + normal.x * 5.5,
    y: base.y + normal.y * 5.5,
  };
  const right = {
    x: base.x - normal.x * 5.5,
    y: base.y - normal.y * 5.5,
  };
  return `M${point(left)} L${point(geometry.tip)} L${point(right)}`;
}

function straightPath(geometry: ArrowGeometry): string {
  return `M${point(geometry.tail)} L${point(geometry.tip)}`;
}

function curvedPath(geometry: ArrowGeometry, curve: number): string {
  const { normal } = vectorGeometry(geometry);
  const offset = Math.max(-100, Math.min(100, curve)) / 100 * 15;
  const control = {
    x: (geometry.tail.x + geometry.tip.x) / 2 + normal.x * offset,
    y: (geometry.tail.y + geometry.tip.y) / 2 + normal.y * offset,
  };
  return `M${point(geometry.tail)} Q${point(control)} ${point(geometry.tip)}`;
}

function spiralPath(geometry: ArrowGeometry): string {
  const { length } = vectorGeometry(geometry);
  return buildCoiledSpiralPath(geometry.tail, geometry.tip, {
    amplitude: Math.min(7.5, length * 0.22),
    turns: 1.75,
  });
}

function wavyPath(geometry: ArrowGeometry): string {
  const { length, unit, normal } = vectorGeometry(geometry);
  const waves = 2.5;
  const amp = 4.5;
  const samples = 24;
  const points: Point[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const progress = i / samples;
    const angle = progress * waves * Math.PI * 2;
    const envelope = Math.sin(progress * Math.PI);
    const across = Math.sin(angle) * amp * envelope;
    const along = progress * length;
    points.push({
      x: geometry.tail.x + unit.x * along + normal.x * across,
      y: geometry.tail.y + unit.y * along + normal.y * across,
    });
  }
  let path = `M${point(points[0])}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    };
    path += ` Q${point(points[i])} ${point(mid)}`;
  }
  path += ` L${point(points[points.length - 1])}`;
  return path;
}

function doubleUnderlinePath(geometry: ArrowGeometry): string {
  const { normal } = vectorGeometry(geometry);
  const offset = 2.2;
  const line1Tail = { x: geometry.tail.x + normal.x * offset, y: geometry.tail.y + normal.y * offset };
  const line1Tip = { x: geometry.tip.x + normal.x * offset, y: geometry.tip.y + normal.y * offset };
  const line2Tail = { x: geometry.tail.x - normal.x * offset, y: geometry.tail.y - normal.y * offset };
  const line2Tip = { x: geometry.tip.x - normal.x * offset, y: geometry.tip.y - normal.y * offset };
  return `M${point(line1Tail)} L${point(line1Tip)} M${point(line2Tail)} L${point(line2Tip)}`;
}

export function buildArrowSvg(
  place: string,
  style: ArrowStyle,
  strokeStyle: ArrowStrokeStyle,
  curve: number,
): string {
  const normalizedPlace = ANNOTATION_PLACES.includes(place as AnnotationPlace)
    ? place as AnnotationPlace
    : "bottom";
  const geometry = ARROW_GEOMETRY[normalizedPlace];
  const handDrawn = HAND_DRAWN_PATHS[normalizedPlace];
  let shaft: string;
  let head = arrowHeadPath(geometry);

  if (style === "hand-drawn") {
    shaft = handDrawn.shaft;
    head = handDrawn.head;
  } else if (style === "straight") {
    shaft = straightPath(geometry);
  } else if (style === "spiral") {
    shaft = spiralPath(geometry);
  } else if (style === "wavy") {
    shaft = wavyPath(geometry);
  } else if (style === "double-underline") {
    shaft = doubleUnderlinePath(geometry);
  } else {
    shaft = curvedPath(geometry, curve);
  }

  const dash = strokeStyle === "dashed" ? ' stroke-dasharray="5 4"' : "";
  return [
    `<svg width="46" height="38" viewBox="0 0 46 38" xmlns="http://www.w3.org/2000/svg" data-crisp-arrow-style="${style}">`,
    `<path d="${shaft}" fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${dash}/>`,
    `<path d="${head}" fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
    "</svg>",
  ].join("");
}

function arrowMaskUrl(
  place: AnnotationPlace,
  settings: CrispAnnotationsSettings,
): string {
  const svg = buildArrowSvg(
    place,
    settings.arrowStyle,
    settings.arrowStrokeStyle,
    settings.arrowCurve,
  );
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function clearArrowAppearanceSettings(style: AppearanceStyle): void {
  style.removeProperty(ANNOTATION_CUSTOM_COLOR_PROPERTY);
  for (const property of Object.values(ARROW_MASK_PROPERTIES)) {
    style.removeProperty(property);
  }
}

export function applyArrowAppearanceSettings(
  style: AppearanceStyle,
  settings: CrispAnnotationsSettings,
): void {
  style.setProperty(ANNOTATION_CUSTOM_COLOR_PROPERTY, settings.customColor);
  const usesBuiltInMask = settings.arrowStyle === "hand-drawn"
    && settings.arrowStrokeStyle === "solid";
  for (const place of ANNOTATION_PLACES) {
    const property = ARROW_MASK_PROPERTIES[place];
    if (usesBuiltInMask) {
      style.removeProperty(property);
    } else {
      style.setProperty(property, arrowMaskUrl(place, settings));
    }
  }
}
