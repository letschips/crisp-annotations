import {
  findAnnotations,
  type AnnotationColor,
  type AnnotationMatch,
  type AnnotationPlace,
} from "./annotation-syntax";

export interface EditorSelectionRange {
  from: number;
  to: number;
}

export interface EditorPreviewRange {
  targetFrom: number;
  targetTo: number;
  directiveFrom: number;
  directiveTo: number;
  note: string;
  color: AnnotationColor;
  place: AnnotationPlace;
  mark: boolean;
  hideDirective: boolean;
}

export function buildEditorPreviewRangesFromAnnotations(
  annotations: readonly AnnotationMatch[],
  selections: readonly EditorSelectionRange[],
): EditorPreviewRange[] {
  return annotations.map((annotation) => {
    const isActive = selections.some((selection) => {
      if (selection.from === selection.to) {
        return selection.from >= annotation.from && selection.from < annotation.to;
      }
      return selection.from < annotation.to && selection.to > annotation.from;
    });
    return {
      targetFrom: annotation.targetFrom,
      targetTo: annotation.targetTo,
      directiveFrom: annotation.directiveFrom,
      directiveTo: annotation.directiveTo,
      note: annotation.spec.note,
      color: annotation.spec.color,
      place: annotation.spec.place,
      mark: annotation.spec.mark,
      hideDirective: !isActive,
    };
  });
}

export function buildEditorPreviewRanges(
  source: string,
  selections: EditorSelectionRange[],
): EditorPreviewRange[] {
  return buildEditorPreviewRangesFromAnnotations(findAnnotations(source), selections);
}
