export interface VerticalRect {
  top: number;
  bottom: number;
}

export function findClosestVisibleAnnotationIndex(
  rectangles: VerticalRect[],
  viewportTop: number,
  viewportBottom: number,
): number | null {
  const viewportCenter = (viewportTop + viewportBottom) / 2;
  let closestIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [index, rectangle] of rectangles.entries()) {
    if (rectangle.bottom < viewportTop || rectangle.top > viewportBottom) {
      continue;
    }
    const annotationCenter = (rectangle.top + rectangle.bottom) / 2;
    const distance = Math.abs(annotationCenter - viewportCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }
  return closestIndex;
}
