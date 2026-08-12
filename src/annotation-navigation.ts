import type { AnnotationMatch } from "./annotation-syntax";

export type AnnotationNavigationDirection = "previous" | "next";

export function findAdjacentAnnotation(
  annotations: AnnotationMatch[],
  cursorOffset: number,
  direction: AnnotationNavigationDirection,
): AnnotationMatch | null {
  if (annotations.length === 0) {
    return null;
  }
  if (direction === "next") {
    return annotations.find((annotation) => annotation.targetFrom > cursorOffset)
      ?? annotations[0];
  }
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    if (annotations[index].targetFrom < cursorOffset) {
      return annotations[index];
    }
  }
  return annotations[annotations.length - 1];
}
