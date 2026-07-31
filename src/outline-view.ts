import {
  ItemView,
  type WorkspaceLeaf,
} from "obsidian";
import { findAnnotations, type AnnotationMatch } from "./annotation-syntax";
import type { CrispAnnotationsSettings } from "./settings";
import { PLACE_LABELS } from "./constants";

export const OUTLINE_VIEW_TYPE = "crisp-annotations-outline-view";

export const COLOR_ICONS: Record<string, string> = {
  neutral: "⬤",
  amber: "🟤",
  orange: "🟠",
  blue: "🔵",
  green: "🟢",
  red: "🔴",
  purple: "🟣",
  rainbow: "🌈",
};

export const COLOR_HEX: Record<string, string> = {
  neutral: "#6b7280",
  amber: "#b8751a",
  orange: "#FC9445",
  blue: "#3b72c4",
  green: "#2f8f5b",
  red: "#c45a38",
  purple: "#8657c8",
  rainbow: "#ff1493",
  custom: "var(--crisp-ann-custom-color, #3b82f6)",
};

export class CrispAnnotationsOutlineView extends ItemView {
  private annotations: AnnotationMatch[] = [];
  private sourceLeaf: WorkspaceLeaf | null = null;
  private readonly settingsProvider: () => CrispAnnotationsSettings;

  constructor(
    leaf: WorkspaceLeaf,
    settingsProvider: () => CrispAnnotationsSettings,
  ) {
    super(leaf);
    this.settingsProvider = settingsProvider;
  }

  getViewType(): string {
    return OUTLINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Annotations outline";
  }

  getIcon(): string {
    return "message-square-text";
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass("crisp-ann-outline-view");
    this.render();
  }

  async onClose(): Promise<void> {
    this.containerEl.empty();
  }

  refresh(source: string, sourceLeaf?: WorkspaceLeaf | null): void {
    this.annotations = findAnnotations(source);
    if (sourceLeaf) {
      this.sourceLeaf = sourceLeaf;
    }
    this.render();
  }

  private render(): void {
    const container = this.containerEl;
    container.empty();

    if (this.annotations.length === 0) {
      const empty = container.createDiv({
        cls: "crisp-ann-outline-empty",
      });
      empty.createSpan({
        text: "No annotations in current document",
      });
      return;
    }

    const header = container.createDiv({
      cls: "crisp-ann-outline-header",
    });
    header.createSpan({
      text: `Annotations (${this.annotations.length})`,
    });

    const list = container.createDiv({
      cls: "crisp-ann-outline-list",
    });

    for (const annotation of this.annotations) {
      const item = list.createDiv({
        cls: `crisp-ann-outline-item crisp-ann-outline-item--${annotation.spec.color}`,
      });

      const colorDot = item.createSpan({
        cls: "crisp-ann-outline-item__color",
        attr: {
          "aria-label": annotation.spec.color,
          style: `color: ${COLOR_HEX[annotation.spec.color] ?? COLOR_HEX.neutral};`,
        },
      });
      colorDot.textContent = COLOR_ICONS[annotation.spec.color] ?? COLOR_ICONS.neutral;

      const body = item.createDiv({
        cls: "crisp-ann-outline-item__body",
      });

      body.createSpan({
        cls: "crisp-ann-outline-item__target",
        text: annotation.target,
      });

      body.createSpan({
        cls: "crisp-ann-outline-item__note",
        text: annotation.spec.note,
      });

      const meta = item.createDiv({
        cls: "crisp-ann-outline-item__meta",
      });
      meta.createSpan({
        cls: "crisp-ann-outline-item__place",
        text: PLACE_LABELS[annotation.spec.place] ?? annotation.spec.place,
      });
      if (!annotation.spec.mark) {
        meta.createSpan({
          cls: "crisp-ann-outline-item__no-mark",
          text: "No highlight",
        });
      }

      item.setAttribute("data-crisp-ann-from", String(annotation.from));
      item.setAttribute("data-crisp-ann-to", String(annotation.to));
      item.addEventListener("click", () => {
        this.navigateToAnnotation(annotation);
      });
    }
  }

  private navigateToAnnotation(annotation: AnnotationMatch): void {
    const activeMarkdownLeaf = this.app.workspace.getLeavesOfType("markdown").find(
      (leaf) => leaf === this.app.workspace.activeLeaf
    );
    const targetLeaf = this.sourceLeaf
      ?? activeMarkdownLeaf
      ?? this.app.workspace.getLeavesOfType("markdown")[0];
    const markdownView = targetLeaf?.view;
    if (!markdownView || !targetLeaf) {
      return;
    }

    const view = markdownView as {
      getMode?(): string;
      currentMode?: {
        applyScroll?(
          line: number,
          options?: { center?: boolean; highlight?: boolean },
        ): boolean;
      };
      editor?: {
        setCursor(pos: { line: number; ch: number }): void;
        offsetToPos(offset: number): { line: number; ch: number };
        scrollIntoView(
          range: { from: { line: number; ch: number }; to: { line: number; ch: number } },
          center?: boolean,
        ): void;
      };
    };
    const editor = view.editor;
    if (!editor) {
      return;
    }

    const from = editor.offsetToPos(annotation.targetFrom);
    const to = editor.offsetToPos(annotation.targetTo);
    editor.setCursor(from);
    this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
    void this.app.workspace.revealLeaf(targetLeaf);

    if (
      view.getMode?.() === "preview"
      && view.currentMode?.applyScroll?.(from.line, {
        center: true,
        highlight: true,
      })
    ) {
      return;
    }

    editor.scrollIntoView({ from, to }, true);
  }
}
