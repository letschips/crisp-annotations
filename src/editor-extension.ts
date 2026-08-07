import type { Extension } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { buildEditorPreviewRangesFromAnnotations } from "./editor-preview";
import { findAnnotations, type AnnotationMatch } from "./annotation-syntax";
import type { AnnotationColor } from "./annotation-syntax";

class AnnotationPreviewWidget extends WidgetType {
  constructor(
    private readonly note: string,
    private readonly color: AnnotationColor,
  ) {
    super();
  }

  eq(other: AnnotationPreviewWidget): boolean {
    return this.note === other.note && this.color === other.color;
  }

  toDOM(view: EditorView): HTMLElement {
    const element = view.dom.ownerDocument.createElement("span");
    element.className = [
      "crisp-ann-editor-badge",
      `crisp-ann-editor-badge--${this.color}`,
    ].join(" ");
    element.setAttribute("aria-label", `Annotation: ${this.note}`);
    element.title = this.note;
    element.textContent = `↳ ${this.note}`;
    return element;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

export function createAnnotationEditorExtension(
  isEnabled: () => boolean,
): Extension {
  class AnnotationEditorPlugin implements PluginValue {
    decorations: DecorationSet;
    private cachedAnnotations: AnnotationMatch[] = [];
    private cacheValid = false;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view, isEnabled());
    }

    update(update: ViewUpdate): void {
      const enabled = isEnabled();
      if (update.docChanged) {
        this.cacheValid = false;
      }
      if (!enabled) {
        if (this.decorations.size > 0) {
          this.decorations = Decoration.none;
        }
        return;
      }
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.buildDecorations(update.view, enabled);
      }
    }

    private buildDecorations(view: EditorView, enabled: boolean): DecorationSet {
      if (!enabled) {
        return Decoration.none;
      }
      if (!this.cacheValid) {
        this.cachedAnnotations = findAnnotations(view.state.doc.toString());
        this.cacheValid = true;
      }
      const docLength = view.state.doc.length;
      const ranges = buildEditorPreviewRangesFromAnnotations(
        this.cachedAnnotations,
        view.state.selection.ranges.map((range) => ({
          from: range.from,
          to: range.to,
        })),
      );
      const builder = new RangeSetBuilder<Decoration>();
      for (const range of ranges) {
        const targetFrom = range.targetFrom;
        const targetTo = range.targetTo;
        // Guard against out-of-bounds ranges that would cause CM6 RangeError.
        if (
          targetFrom < 0
          || targetFrom > targetTo
          || targetTo > docLength
        ) {
          continue;
        }
        const targetClasses = [
          "crisp-ann-editor-target",
          `crisp-ann-editor-target--${range.color}`,
        ];
        if (!range.mark) {
          targetClasses.push("crisp-ann-editor-target--no-mark");
        }
        builder.add(
          targetFrom,
          targetTo,
          Decoration.mark({
            class: targetClasses.join(" "),
            attributes: {
              "data-crisp-ann-place": range.place,
              title: range.note,
            },
          }),
        );
        if (range.hideDirective) {
          const directiveFrom = range.directiveFrom;
          const directiveTo = range.directiveTo;
          // Guard against out-of-bounds directive ranges for the replace widget.
          if (
            directiveFrom >= 0
            && directiveFrom <= directiveTo
            && directiveTo <= docLength
          ) {
            builder.add(
              directiveFrom,
              directiveTo,
              Decoration.replace({
                widget: new AnnotationPreviewWidget(range.note, range.color),
              }),
            );
          }
        }
      }
      return builder.finish();
    }

    destroy(): void {
      this.cachedAnnotations = [];
      this.cacheValid = false;
    }
  }

  return ViewPlugin.fromClass(AnnotationEditorPlugin, {
    decorations: (plugin) => plugin.decorations,
  });
}
