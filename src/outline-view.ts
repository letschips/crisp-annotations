import {
  ItemView,
  type TFile,
  type WorkspaceLeaf,
} from "obsidian";
import {
  ANNOTATION_COLORS,
  findAnnotations,
  type AnnotationMatch,
} from "./annotation-syntax";
import type { CrispAnnotationsSettings } from "./settings";
import { COLOR_LABELS, PLACE_LABELS } from "./constants";
import {
  filterVaultAnnotationEntries,
  type VaultAnnotationColorFilter,
  type VaultAnnotationEntry,
} from "./vault-annotation-index";

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
  private vaultAnnotations: VaultAnnotationEntry[] = [];
  private sourceLeaf: WorkspaceLeaf | null = null;
  private outlineScope: "current" | "vault" = "current";
  private searchQuery = "";
  private colorFilter: VaultAnnotationColorFilter = "all";
  private vaultLoading = false;
  private readonly settingsProvider: () => CrispAnnotationsSettings;

  constructor(
    leaf: WorkspaceLeaf,
    settingsProvider: () => CrispAnnotationsSettings,
    private readonly onVaultScopeRequested?: () => void,
  ) {
    super(leaf);
    this.settingsProvider = settingsProvider;
  }

  getViewType(): string {
    return OUTLINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "标注中心";
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

  refreshVault(entries: VaultAnnotationEntry[]): void {
    this.vaultAnnotations = entries;
    if (this.outlineScope === "vault") {
      this.render();
    }
  }

  setVaultLoading(loading: boolean): void {
    this.vaultLoading = loading;
    if (this.outlineScope === "vault") {
      this.render();
    }
  }

  private render(restoreSearchFocus = false): void {
    const container = this.containerEl;
    container.empty();

    const scope = container.createDiv({
      cls: "crisp-ann-outline-scope",
    });
    for (const option of [
      { value: "current", label: "当前文档" },
      { value: "vault", label: "整个仓库" },
    ] as const) {
      const button = scope.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "crisp-ann-outline-scope__button";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(this.outlineScope === option.value));
      button.addEventListener("click", () => {
        this.outlineScope = option.value;
        this.render();
        if (option.value === "vault") {
          this.onVaultScopeRequested?.();
        }
      });
      scope.appendChild(button);
    }

    if (this.outlineScope === "vault") {
      this.renderVaultContent(container, restoreSearchFocus);
      return;
    }

    if (this.annotations.length === 0) {
      const empty = container.createDiv({
        cls: "crisp-ann-outline-empty",
      });
      empty.createSpan({
        text: "当前文档没有标注",
      });
      return;
    }

    const header = container.createDiv({
      cls: "crisp-ann-outline-header",
    });
    header.createSpan({
      text: `标注 (${this.annotations.length})`,
    });

    const list = container.createDiv({
      cls: "crisp-ann-outline-list",
    });

    for (const annotation of this.annotations) {
      this.renderAnnotationItem(list, annotation);
    }
  }

  private renderVaultContent(
    container: HTMLElement,
    restoreSearchFocus: boolean,
  ): void {
    const toolbar = container.createDiv({
      cls: "crisp-ann-outline-search",
    });
    const search = toolbar.ownerDocument.createElement("input");
    search.type = "search";
    search.className = "crisp-ann-outline-search__input";
    search.placeholder = "搜索原文、标注或文件…";
    search.setAttribute("aria-label", "搜索全库标注");
    search.value = this.searchQuery;
    search.addEventListener("input", () => {
      this.searchQuery = search.value;
      this.render(true);
    });
    toolbar.appendChild(search);
    if (restoreSearchFocus) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }

    const color = toolbar.ownerDocument.createElement("select");
    color.className = "crisp-ann-outline-search__color dropdown";
    color.setAttribute("aria-label", "按颜色筛选标注");
    for (const value of ["all", ...ANNOTATION_COLORS] as const) {
      const option = color.ownerDocument.createElement("option");
      option.value = value;
      option.textContent = value === "all" ? "全部颜色" : COLOR_LABELS[value];
      option.selected = value === this.colorFilter;
      color.appendChild(option);
    }
    color.addEventListener("change", () => {
      this.colorFilter = color.value as VaultAnnotationColorFilter;
      this.render();
    });
    toolbar.appendChild(color);

    const entries = filterVaultAnnotationEntries(
      this.vaultAnnotations,
      this.searchQuery,
      this.colorFilter,
    );
    if (entries.length === 0) {
      const empty = container.createDiv({
        cls: "crisp-ann-outline-empty",
      });
      empty.createSpan({
        text: this.vaultLoading
          ? "正在索引仓库标注…"
          : this.searchQuery.trim() || this.colorFilter !== "all"
            ? "没有匹配的标注"
            : "仓库中还没有标注",
      });
      return;
    }

    const header = container.createDiv({
      cls: "crisp-ann-outline-header",
    });
    header.createSpan({
      text: entries.length === this.vaultAnnotations.length
        ? `全库标注 (${entries.length})`
        : `筛选结果 (${entries.length}/${this.vaultAnnotations.length})`,
    });

    const groups = new Map<string, VaultAnnotationEntry[]>();
    for (const entry of entries) {
      const group = groups.get(entry.file.path) ?? [];
      group.push(entry);
      groups.set(entry.file.path, group);
    }
    const list = container.createDiv({
      cls: "crisp-ann-outline-list crisp-ann-outline-list--vault",
    });
    for (const [path, groupEntries] of groups) {
      const group = list.createDiv({
        cls: "crisp-ann-outline-file-group",
      });
      const groupHeader = group.createDiv({
        cls: "crisp-ann-outline-file-group__header",
      });
      groupHeader.createSpan({
        cls: "crisp-ann-outline-file-group__name",
        text: groupEntries[0].file.basename,
      });
      groupHeader.createSpan({
        cls: "crisp-ann-outline-file-group__count",
        text: String(groupEntries.length),
      });
      group.createDiv({
        cls: "crisp-ann-outline-file-group__path",
        text: path,
      });
      for (const entry of groupEntries) {
        this.renderAnnotationItem(group, entry.annotation, entry);
      }
    }
  }

  private renderAnnotationItem(
    list: HTMLElement,
    annotation: AnnotationMatch,
    vaultEntry?: VaultAnnotationEntry,
  ): void {
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
        text: annotation.target.replace(/\n/g, " "),
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
          text: "无高亮",
        });
      }

      item.setAttribute("data-crisp-ann-from", String(annotation.from));
      item.setAttribute("data-crisp-ann-to", String(annotation.to));
      if (vaultEntry) {
        item.setAttribute("data-crisp-ann-file", vaultEntry.file.path);
      }
      item.addEventListener("click", () => {
        void this.navigateToAnnotation(annotation, vaultEntry);
      });
  }

  private async navigateToAnnotation(
    annotation: AnnotationMatch,
    vaultEntry?: VaultAnnotationEntry,
  ): Promise<void> {
    const activeMarkdownLeaf = this.app.workspace.getLeavesOfType("markdown").find(
      (leaf) => leaf === this.app.workspace.activeLeaf
    );
    let targetLeaf: WorkspaceLeaf | null | undefined;
    if (vaultEntry) {
      targetLeaf = this.app.workspace.getLeavesOfType("markdown").find((leaf) => (
        (leaf.view as { file?: { path?: string } }).file?.path === vaultEntry.file.path
      ));
      if (!targetLeaf) {
        const file = this.app.vault.getAbstractFileByPath(vaultEntry.file.path);
        if (!file) {
          return;
        }
        targetLeaf = this.app.workspace.getLeaf("tab");
        await targetLeaf.openFile(file as TFile, { active: true });
      }
    } else {
      targetLeaf = this.sourceLeaf
        ?? activeMarkdownLeaf
        ?? this.app.workspace.getLeavesOfType("markdown")[0];
    }
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
