import {
  findAnnotations,
  removeAnnotationFromSource,
  serializeAnnotation,
  type AnnotationMatch,
} from "./annotation-syntax";

export type AnnotationTransformAction = "remove" | "toggle-mark";

function hasSameIdentity(
  candidate: AnnotationMatch,
  reference: AnnotationMatch,
): boolean {
  return candidate.target === reference.target
    && candidate.spec.note === reference.spec.note
    && candidate.spec.place === reference.spec.place
    && candidate.spec.color === reference.spec.color
    && candidate.spec.mark === reference.spec.mark;
}

export function findReferencedAnnotation(
  source: string,
  reference: AnnotationMatch,
): AnnotationMatch | null {
  const annotations = findAnnotations(source);
  const exact = annotations.find((candidate) => (
    candidate.from === reference.from && hasSameIdentity(candidate, reference)
  ));
  if (exact) {
    return exact;
  }
  const matches = annotations.filter((candidate) => (
    hasSameIdentity(candidate, reference)
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function transformReferencedAnnotation(
  source: string,
  reference: AnnotationMatch,
  action: AnnotationTransformAction,
): string | null {
  const annotation = findReferencedAnnotation(source, reference);
  if (!annotation) {
    return null;
  }
  if (action === "remove") {
    return removeAnnotationFromSource(source, annotation);
  }
  const replacement = serializeAnnotation(annotation.target, {
    ...annotation.spec,
    mark: !annotation.spec.mark,
  });
  return `${source.slice(0, annotation.from)}${replacement}${source.slice(annotation.to)}`;
}
